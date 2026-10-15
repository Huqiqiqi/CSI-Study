# 第二章 Linux 驱动与底层媒体处理

## 2.1 驱动究竟在帮你做什么

应用想要的是“给我下一帧”。硬件需要的却是一长串动作：开电源、配置时钟、释放复位、读芯片 ID、写模式寄存器、准备接收端、分配 buffer、打开数据流、处理中断。驱动把这些具体动作包装成统一接口。

**V4L2**提供视频设备与控制接口；**Media Controller**描述多个硬件模块怎样连接；**subdevice**通常表示传感器、接收器、ISP 等内部模块；**videobuf2**帮助驱动管理流式 buffer。`/dev/videoX` 不一定是可直接播放的图像出口，还可能是 RAW、统计信息、ISP 参数或编解码节点。[Linux sub-device 接口](https://docs.kernel.org/userspace-api/media/v4l/dev-subdev.html)

![图 5 Linux 摄像头栈与媒体拓扑](assets/05_linux_stack.svg)

RK3588 BSP 中常见的概念链路是：sensor → D-PHY/DC-PHY → CSI-2 receiver → RKCIF/VICAP → ISP → YUV 输出。它是帮助理解的逻辑顺序，实际存在直通、落内存、读回以及虚拟 ISP 等路径。不要据此推断每两个模块之间都完整复制一次图像。主线内核的节点名称和驱动组织也可能不同。[Linux RKCIF 说明](https://cdn.kernel.org/doc/html/latest/admin-guide/media/rkcif.html)

## 2.2 实验 2 找到正确的图像出口

**前提**：接好配套模组，启动厂商相机支持镜像；暂时退出占用摄像头的 Qt 相机程序。不要先停止所有名字里带 ISP 的服务，部分镜像正需要 IQ 服务维持 3A。

```bash
# 板端 Bash
v4l2-ctl --list-devices
for m in /dev/media*; do
    [ -e "$m" ] || continue
    media-ctl -d "$m" -p
done
for p in /sys/class/video4linux/video*/name; do
    [ -f "$p" ] || continue
    printf '%s: ' "$p"
    cat "$p"
done
```

`media-ctl -p` 里，每个 entity 是模块，pad 是端口，link 是连线。沿 sensor 的 source pad 向后找，确认到达采集链路和 ISP 输出。看到 `ENABLED` 代表链路被启用，不等于电线已经传出正确图像。保存完整输出，在增加第二颗摄像头后再做差异比较。

官方 R8 文档给出的历史参考映射如下。它只用于识别版本差异，不能替代板端探测。

| 丝印 | 指定 R8 SDK 文档中的参考输出 |
| --- | --- |
| MIPI CSI1 | `/dev/video62` |
| MIPI CSI2 | `/dev/video71` |
| MIPI CSI3 | `/dev/video44` |
| MIPI CSI4 | `/dev/video53` |

早期出厂示例使用过 `/dev/video22`、`/dev/video31`。节点数字变化并不说明硬件损坏；设备注册数量和顺序都会影响数字。产品中应通过 entity、sysfs 路径或验证过的 udev 规则绑定摄像头身份。

找到候选 YUV 节点后设置变量。这里故意要求你填入自己的结果，防止误用另一板型的节点：

```bash
export CAM=/dev/videoREPLACE_ME
v4l2-ctl -d "$CAM" --all
v4l2-ctl -d "$CAM" --list-formats-ext
fuser "$CAM"
```

优先选择报告支持 NV12 的 ISP 输出。不要把 RAW 节点强行声明为 NV12。若返回设备忙，用 `fuser` 查占用者，正常关闭那一个应用；多个程序同时打开同一采集节点不一定受支持。

## 2.3 实验 3 先收帧 不显示 不编码

第一步沿用该节点当前可工作的格式，排除显示端干扰：

```bash
v4l2-ctl -d "$CAM" --get-fmt-video
v4l2-ctl -d "$CAM" --stream-mmap=4 --stream-count=120 \
    --stream-to=/dev/null --verbose
```

若驱动已配置到正确链路，应该看到 buffer 持续返回，采集达到数量后退出。命令卡住时可以用 Ctrl+C 结束，同时在另一个终端看 `dmesg -w`。某些系统限制普通用户读内核日志，在你管理的开发板上再使用 `sudo dmesg -w`。

第二步才试一个枚举支持的 NV12 分辨率：

```bash
# 以下仅在该输出支持此格式和尺寸时执行
v4l2-ctl -d "$CAM" \
    --set-fmt-video=width=1920,height=1080,pixelformat=NV12
v4l2-ctl -d "$CAM" --get-fmt-video
v4l2-ctl -d "$CAM" --stream-mmap=4 --stream-count=120 \
    --stream-to=/dev/null --verbose
```

一定读回格式：驱动可能调整尺寸和 stride，`S_FMT` 成功并不表示接受了每个请求值。若设置帧率不支持，不能靠添加 `--set-parm=30` 强迫 sensor 运行到 30 fps；要检查 sensor mode、VBLANK 和整个 pipeline 的协商。部分 BSP 还需要其相机管理组件启动和配置 ISP。

**验收证据**：记录实际格式、采集耗时、错误数、sequence 是否连续、实测 fps。120 帧在 30 fps 附近大约需要 4 秒，但启动预热和丢弃帧会影响墙钟时间。画面未检查前，只能说“持续收帧成功”。

## 2.4 从 buffer 理解 V4L2 应用开发

把 buffer 想成周转箱：应用把空箱交给驱动，驱动填完像素再交回，应用用完必须归还。不给空箱，摄像头即使一直工作也可能无法继续把图像交给应用。

![图 6 V4L2 缓冲区周转](assets/06_buffers.svg)

典型 MMAP 采集流程为 `open → QUERYCAP → ENUM_FMT → S_FMT/G_FMT → REQBUFS → QUERYBUF/mmap → QBUF → STREAMON → poll/DQBUF/处理/QBUF → STREAMOFF → munmap → close`。读驱动返回的 buffer 数量，不假定申请四个就一定得到四个。[MMAP 采集](https://docs.kernel.org/userspace-api/media/v4l/mmap.html)、[REQBUFS](https://docs.kernel.org/userspace-api/media/v4l/vidioc-reqbufs.html)

`DQBUF` 返回的是“哪一个箱子好了”，不一定复制像素。应用借着映射读取内容。`QBUF` 之后驱动可再次使用该内存，因此不能把它的指针交给另一个长期任务后立刻归还。异步编码或 AI 必须处理 buffer 生命周期，可以引用计数、等待硬件完成，或选择明确的复制策略。[QBUF 与 DQBUF](https://docs.kernel.org/userspace-api/media/v4l/vidioc-qbuf.html)

多平面 API 使用 `V4L2_BUF_TYPE_VIDEO_CAPTURE_MPLANE` 和 `v4l2_plane` 数组。它和图像本身有几个颜色平面是相关但不完全相同的概念。请依据 `QUERYCAP` 和返回格式选择 API，不要拿只支持单平面的几十行示例直接覆盖所有 RKISP 节点。

```c
/* 教学伪代码：省略错误处理和单/多平面分支，不能单独编译 */
while (running) {
    wait_until_readable(fd, timeout_ms);
    dequeue_buffer(fd, &buf);  /* DQBUF */
    inspect_timestamp_sequence_and_flags(&buf);
    consume_before_requeue(&buf);
    queue_buffer(fd, &buf);    /* QBUF */
}
```

实际代码需要处理 `EINTR`、非阻塞情况下的 `EAGAIN`、超时、设备断开、buffer error flag，以及所有资源释放分支。停止流时用 STREAMOFF，不要只终止读线程却让硬件维持旧状态。[STREAMON/OFF](https://docs.kernel.org/userspace-api/media/v4l/vidioc-streamon.html)

## 2.5 设备树是板级连接说明书

设备树负责描述“哪个硬件挂在哪个总线上，用哪些电源、时钟、GPIO，图像连到哪个端口”。驱动负责实现操作。改 `compatible` 字符串不会把另一种 sensor 自动变成 IMX415，改节点名也不会改变接线。

先在**自己的 SDK 源码目录**中查找，不要把网上 DTS 整段覆盖进去：

```bash
# Linux 开发主机：在实际内核源码根目录执行
rg -n 'sony,imx415|imx415|camera-module' arch/arm64/boot/dts/rockchip
rg -n 'CONFIG_VIDEO_IMX415|VIDEO_IMX415' drivers/media/i2c .config
rg -n 'imx415|csi2_dphy|rkcif|rkisp' drivers/media
```

设备树片段的结构可以这样阅读。下面是**不可部署的结构模板**，所有 `REPLACE_...` 必须来自本板原理图和已工作的 DTS；并未给未知板卡编造 GPIO 或时钟编号：

```dts
&REPLACE_I2C_CONTROLLER {
    status = "okay";
    camera@1a {
        compatible = "sony,imx415";
        reg = <0x1a>; /* 示例，仍需核对模组地址 */
        clocks = <&REPLACE_CLOCK_CONTROLLER REPLACE_CLOCK_ID>;
        clock-names = "xvclk"; /* 这是部分 BSP 的名称 */
        /* supplies、GPIO、pinctrl、模块信息取自匹配 BSP */
        port {
            sensor_out: endpoint {
                remote-endpoint = <&REPLACE_PHY_INPUT>;
                data-lanes = <1 2 3 4>;
            };
        };
    };
};
```

逐段追踪 sensor → PHY 输入、PHY 输出 → CSI host、CSI → CIF、CIF → ISP。两端 `remote-endpoint` 应正确对应，相关硬件节点应启用；PHY 硬件节点与逻辑端口可能分别需要启用。`data-lanes` 是线路映射，不能只在一端把 2 改成 4 就认为完成提速。

主线 binding 与 Rockchip BSP 可能在 `clock-names`、电源字段、模块信息和路由组织上不同。应该查同一源码树的 binding 与驱动解析代码。网上 `xvclk`、`inck` 的差别有时只是接口约定不同，不能随意互换。[设备树 binding 编写原则](https://www.kernel.org/doc/html/latest/devicetree/bindings/writing-bindings.html)

运行中的设备树也要核实。安装了 dtc 且内核暴露对应目录时，可在板端导出：

```bash
dtc -I fs -O dts /sys/firmware/devicetree/base > running-tree.dts
```

导出可能带警告和数字 phandle，适合审计，不建议把它直接当作维护源码。源码中的标签不会完整保留。修改了文件但效果不变时，要核查 bootloader 实际加载的 DTB/overlay，而不是反复改同一份未被加载的文件。

## 2.6 一次真正的 sensor 驱动适配怎样推进

**第一阶段 读懂已有驱动**。以匹配 SDK 的 `drivers/media/i2c/imx415.c` 为例，寻找 probe、供电、模式表、格式协商、control 和启停流代码。公开 Rockchip `develop-6.1` 分支可用于对照，但不能替代正点原子交付源码。[Rockchip IMX415 源码](https://github.com/rockchip-linux/kernel/blob/develop-6.1/drivers/media/i2c/imx415.c)

**第二阶段 固定一个模式**。先做单路、线性 SDR、一个分辨率和一个帧率。记录 input clock、lane 数、位深、link frequency、HTS/HMAX、VTS/VMAX、曝光和增益范围。HTS/HMAX 在不同传感器手册里的计量单位可能不同，不能把所有寄存器直接按像素数解释。

**第三阶段 供电与 ID**。按手册处理 regulator、clock、reset/pwdn 和延时，读真实的芯片 ID，校验失败应返回错误。`-EPROBE_DEFER` 常表示依赖资源尚未就绪；I²C ACK 只能证明地址上有响应，不证明型号和模式正确。普通 `i2cdetect` 扫描也有设备副作用，第一轮优先读取驱动日志，不自动盲扫总线。

**第四阶段 格式与控制**。枚举支持的 bus code、尺寸和帧间隔，区分 TRY 与 ACTIVE 状态。实现曝光、模拟增益、blanking 等 control，并在改变 VBLANK 后更新合法曝光范围。驱动默认值、实际寄存器值和应用看到的 control 要一致。[V4L2 controls](https://docs.kernel.org/driver-api/media/v4l2-controls.html)

**第五阶段 流与电源管理**。start 时恢复电源、写模式表、应用 controls，最后开启输出；失败时回滚资源。stop 时停止传感器，配合 runtime PM。新内核逐步使用 streams API，很多 BSP 仍使用 `.s_stream`，函数签名和状态结构应从本树复制。不要从最新主线教程粘 API 到旧 BSP 后靠强制类型转换压掉警告。[Linux sensor 驱动指导](https://cdn.kernel.org/doc/html/latest/driver-api/media/camera-sensor.html)

**第六阶段 图像和耐久性**。先检查静态画面，再检查运动、暗光、重复启停、长时间运行。自动曝光下帧率可能变化，必须分辨应用请求帧率、传感器真实帧率和重复显示帧。正式加入 HDR 前，确认短长曝光、VC、ISP 模式和 IQ 都有配套。

## 2.7 帧率 曝光和模式表的关系

对于采用相应像素时序定义的传感器，可用 `帧时间 = (有效宽 + 水平 blanking) × (有效高 + 垂直 blanking) ÷ 像素阵列时钟` 理解帧率。扩大 VBLANK 往往会延长帧时间，也扩大可能的曝光窗口；曝光不能任意超过帧时间允许的范围。注意这里的像素阵列时钟不一定等于 CSI 总线推导的像素率。[Linux sensor 时序解释](https://cdn.kernel.org/doc/html/latest/userspace-api/media/drivers/camera-sensor.html)

调试实验：在驱动明确支持的 control 范围内，关闭自动曝光或让 3A 进入对应手动模式，逐步改变曝光，记录画面亮度和帧间隔。若 IQ 服务仍在自动调节，你手工写下的值可能立刻被覆盖；先明确“谁拥有控制权”。不要向未知寄存器写猜测值。

## 2.8 编译 部署与可回滚的验证

使用正点原子对应 SDK 和编译说明，先原样编译一次，证明工具链和配置可复现。保存内核 commit/版本、defconfig、DTS 文件和编译日志。随后一次只改一个问题。厂商的 `build.sh` 子命令随 SDK 不同，本书不假定统一的烧写命令。

内核模块编译需要匹配运行内核的配置、生成头文件、ABI 和符号版本。`uname -r` 相同仍不充分；不同编译配置也可能不兼容。模块载入报 `invalid module format` 时检查 `modinfo`、vermagic 和内核日志，不要强制忽略版本。静态编入内核的驱动不能靠替换一个 `.ko` 更新。[Linux 外部模块构建](https://www.kernel.org/doc/html/latest/kbuild/modules.html)

部署前保留已知可启动镜像、DTB 和恢复方式，确认系统分区与烧写工具对应本板。初学者更适合在备用启动介质上验证。启动后检查运行版本和设备树，再重复实验 2、3，不能只看编译器退出码就说硬件适配成功。

## 2.9 ISP 与 IQ 为什么是独立工作

ISP 处理去马赛克、黑电平、降噪、颜色和其他图像处理；3A 通常指自动曝光 AE、自动白平衡 AWB、自动对焦 AF。没有可控镜头的模组不一定具备 AF。Rockchip 系统中的 RkAIQ/IQ 文件和服务启动方式依赖 SDK；从配套启动脚本或进程确认实际机制。

```bash
ps -ef | grep -Ei 'rkaiq|rkisp|camera' | grep -v grep
find /etc /usr/share -maxdepth 4 -iname '*iq*' 2>/dev/null
```

图像能出但很暗、偏色或噪点大，既可能是 IQ，也可能是格式解释、镜头、供电或曝光。先确保 RAW/Bayer 顺序和基本寄存器正确，再处理调校。IQ 与模组、镜头、模式匹配，不要用另一颗 sensor 的文件“改名冒充”。

## 2.10 第一段驱动代码应该怎样读

初学者遇到驱动代码，不妨先认识几个写法：`struct` 把同一设备的信息放在一起，指针指向这份信息，`->` 访问指针所指结构里的成员，`ret` 保存操作结果，负数通常代表内核错误，`goto` 常用于统一回收已经申请的资源。函数指针表类似“操作菜单”：框架调用菜单中的 set_fmt、set_ctrl 或 stream 函数，具体函数再操作硬件。

以下是**16 位寄存器地址加 8 位值协议的教学辅助函数**。它不包含任何初始化寄存器，不是完整 sensor 驱动，也不能未经核对就替换其他协议的读写函数：

```c
#include <linux/i2c.h>
#include <linux/errno.h>

static int lesson_write_reg8(struct i2c_client *client,
                             u16 reg, u8 value)
{
    /* 先发寄存器地址高字节，再发低字节，最后发一个值 */
    u8 payload[3] = { reg >> 8, reg & 0xff, value };
    int ret = i2c_master_send(client, (const char *)payload,
                              sizeof(payload));

    if (ret < 0)
        return ret;  /* 保存总线给出的真实错误 */
    if (ret != (int)sizeof(payload))
        return -EIO; /* 短传输也不是成功 */
    return 0;
}
```

`client` 已经代表一个具体 I²C 设备地址，所以 payload 不再手工塞入另一份 I²C 从地址。`reg >> 8` 和 `reg & 0xff` 拆开寄存器地址；它们与传感器输出 RAW10 位深没有直接关系。代码中 char 指针转换只用于把这段字节交给对应接口。I²C 读寄存器往往要先写寄存器地址再读数据，是否要求 repeated START、寄存器地址宽度、数据宽度，都由器件协议决定。[Linux I²C 客户端驱动](https://docs.kernel.org/i2c/writing-clients.html)

这个函数只解决“发送一次写操作”。它没有负责开电源、锁保护、自动重试、寄存器缓存、模式选择或 stream 状态。向正确地址发送了三个字节，只说明总线传输达到预期长度，不能证明设置的参数组合能出图。真实驱动应继续保留上层错误传播和状态回滚。

再用下面的**流程伪代码**理解模式切换，不要当作跨内核版本的可编译实现：

```text
start_stream:
  加锁
  取得运行时电源引用，失败就退出
  写入已经验证的当前模式寄存器表
  应用当前曝光与增益等控制值
  写开始输出寄存器
  只有全部成功，才记录 streaming = true
  若中间失败，释放本次电源引用并保留错误码
  解锁

stop_stream:
  加锁
  请求传感器停止输出并处理失败
  按框架约定释放电源引用、恢复状态
  解锁
```

阅读你 SDK 里的实现，给每一步标出函数名。然后回答：为什么模式表写到一半失败时，不应该仍把 streaming 设为 true？因为软件会误以为硬件已成功开始，后续启停与资源引用都可能失配。驱动适配不仅是“让成功路径跑起来”，还包括让失败路径可恢复。

**本章验收**：保存一份媒体拓扑、一个持续采集结果、一张正常图像和一份版本清单。能沿着一次 STREAMON 解释从应用到 sensor 的主要调用职责，能说出设备树、驱动和 IQ 分别解决什么问题。
