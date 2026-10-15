# 第三章 音视频处理框架与编码

## 3.1 用传送带理解 GStreamer

一个 pipeline 像一条装配线：source 提供数据，filter 改变数据，encoder 压缩数据，muxer 整理音视频，sink 消费数据。GStreamer 中的 element 是工位，pad 是进出口，caps 是双方约定的材料规格，buffer 是带着时间戳的数据，bus 是向应用报告错误与状态的通知通道。

```text
v4l2src → NV12 图像 → H.264 编码器 → h264parse → MP4 封装器 → 文件
```

这里 `video/x-raw` 表示未压缩像素，`video/x-h264` 表示压缩视频。`h264parse` 整理码流结构、对齐和相关信息，不负责压缩；`videoconvert` 改像素格式，不把 RAW Bayer 自动变成经过完整 ISP 调校的彩色视频。

FFmpeg 更像方便处理文件、转码和分析码流的工具箱。GStreamer 适合搭建持续运行和分支处理的 pipeline。Rockchip MPP 是通向硬件编解码能力的一层软件；RGA 处理二维图像变换；ISP 处理相机图像。三者职责不同。[MPP 官方项目](https://github.com/rockchip-linux/mpp)

## 3.2 实验 4 不接相机也能完成第一条 pipeline

```bash
# 板端 Bash 或装有 GStreamer 的 Linux 电脑
gst-inspect-1.0 videotestsrc
gst-launch-1.0 -v videotestsrc num-buffers=60 \
    ! video/x-raw,width=640,height=360,framerate=30/1 \
    ! fakesink
```

`videotestsrc` 生成测试图；`num-buffers=60` 限制输出数量；caps 限定规格；`fakesink` 丢弃数据。没有 live 时钟约束时，测试图可能很快处理完，不能拿这里的运行时间测摄像头帧率。

有桌面显示环境再运行：

```bash
gst-launch-1.0 -v videotestsrc is-live=true \
    ! video/x-raw,width=640,height=360,framerate=30/1 \
    ! videoconvert ! autovideosink
```

`is-live=true` 模拟实时源。看到测试图说明基础框架和显示路径可用，不代表 CSI 驱动已经工作。纯 SSH 终端没有显示会话时，继续用 `fakesink`。

遇到 `no element` 就缺元件或插件加载失败；`not-negotiated` 通常是相邻元件格式不一致；`Device or resource busy` 是设备占用；无法打开显示器则检查桌面、权限和 sink。先把长 pipeline 缩短，找到最早失败的一段。

## 3.3 编码不是把文件扩展名改成 H.264

未压缩图像很大，编码器利用空间和时间冗余减少数据量。I 帧可以理解为较独立的图像描述，P 帧主要借助已有参考帧，B 帧还可能利用双向参考。IDR 是一种让解码参考关系重新开始的重要随机访问点；不是所有 I 帧都等价于 IDR。

**码率**是每秒输出多少压缩比特，决定网络与磁盘预算；**帧率**是每秒多少张图；**分辨率**是一张图多少像素；**GOP**描述帧组关系。缩短关键帧间隔一般有助于新观众更快加入和切片，但也会影响码率或画质。B 帧和前瞻分析可能改善压缩，却增加缓存和重排需求。

![图 7 编码 解析 封装与传输的层次](assets/07_codec_container.svg)

起步选择 H.264、8 位 4:2:0、SDR，WebRTC 路线优先无 B 帧并确认 profile 兼容。H.265 可能更节省码率，但不能默认所有浏览器、设备和传输方式都支持；以目标浏览器测试为准。[浏览器编解码兼容说明](https://mediamtx.org/docs/features/webrtc-specific-features)

## 3.4 实验 5 软件编码建立可检查的样本

**前提**：`gst-inspect-1.0 x264enc`、`h264parse`、`mp4mux` 均成功。x264 软件编码适合低分辨率入门，不作为 RK3588 多路硬件性能的替代证明。

```bash
gst-launch-1.0 -e -v \
    videotestsrc is-live=true num-buffers=150 \
    ! video/x-raw,format=I420,width=640,height=360,framerate=30/1 \
    ! x264enc tune=zerolatency speed-preset=ultrafast \
        bitrate=1000 key-int-max=30 bframes=0 \
    ! h264parse ! mp4mux ! filesink location=test-pattern.mp4
ffprobe -v error -show_streams -show_format test-pattern.mp4
```

预期得到约 5 秒 MP4。读取 `codec_name`、width、height、时长与帧率，打开文件观察颜色和运动。`bitrate=1000` 是 x264enc 的 kbit/s；不能直接把这个数复制到单位为 bit/s 的另一编码器。`-e` 让 gst-launch 在正常中断时尝试发送 EOS，帮助封装器完成收尾。

文件存在不代表有效：大小为零、只有头没有帧、缺少索引，都可能导致无法播放。使用 ffprobe 验证结构，再实际解码检查。

## 3.5 实验 6 在 RK3588 上找到硬件编码能力

```bash
gst-inspect-1.0 mpph264enc
gst-inspect-1.0 mppvideodec
ffmpeg -hide_banner -encoders
ffmpeg -hide_banner -decoders
```

厂商镜像可能提供 `mpph264enc` 和 `mppvideodec`，也可能采用不同插件组合。普通发行版 FFmpeg 不一定有 Rockchip H.264 硬件编码器；看到 `rkmpp` 字样也要区分它出现在解码器还是编码器列表。不要默认 `-c:v h264_rkmpp` 在任何版本都存在。

插件存在后，保存 `gst-inspect` 输出，读 sink caps、可接受内存类型、码率单位、GOP、profile 等属性。有些厂商版本使用 `bps`、`gop` 等名称；教材脚本默认不盲目传入这些版本相关属性。

在该硬件编码器确实支持 NV12 测试输入时运行：

```bash
gst-launch-1.0 -e -v \
    videotestsrc is-live=true num-buffers=150 \
    ! video/x-raw,format=NV12,width=1280,height=720,framerate=30/1 \
    ! mpph264enc ! h264parse ! mp4mux \
    ! filesink location=hw-pattern.mp4
```

此时使用默认编码参数，只验证通路；正式推流前需要根据本机属性设置并检查目标码率、关键帧间隔和 B 帧情况。用 ffprobe 查看输出，再对比 CPU 占用和插件日志。CPU 占用低是辅助证据，选择了什么插件、插件调用的后端与输出质量才共同构成验证。

## 3.6 实验 7 用真实 CSI 图像替换测试图

**前提**：第二章持续采集通过，变量 CAM 指向正确 ISP YUV 输出，选择的尺寸与帧率已验证。

```bash
gst-launch-1.0 -e -v \
    v4l2src device="$CAM" io-mode=mmap num-buffers=150 \
    ! video/x-raw,format=NV12,width=1920,height=1080,framerate=30/1 \
    ! mpph264enc ! h264parse ! mp4mux \
    ! filesink location=csi-single.mp4
```

先用 MMAP 降低问题复杂度。如果 mpph264enc 不支持当前内存导入或格式，返回到测试图验证，检查 BSP 插件说明；不要无限堆叠 `videoconvert`。CPU 转换可能帮助定位格式问题，也可能掩盖性能瓶颈。

成功后再尝试 `io-mode=dmabuf`，观察 caps、日志、稳定性和占用变化。DMA-BUF 允许不同设备共享 buffer 引用，但不会自动保证零复制；格式、stride、modifier、对齐、缓存同步和生命周期必须全部兼容。[v4l2src 元件](https://gstreamer.freedesktop.org/documentation/video4linux2/v4l2src.html)

## 3.7 tee queue 和延迟的关系

`tee` 把一条数据流分给多个下游；每个分支通常需要独立 queue 才能在不同线程推进。queue 有缓冲上限，某个分支长期处理不过来，仍可能通过背压拖住整条 pipeline。它不是无限隔离器。[tee](https://gstreamer.freedesktop.org/documentation/coreelements/tee.html)

实时预览可以选择丢弃旧的**原始图像**，例如 `queue max-size-buffers=2 max-size-time=0 max-size-bytes=0 leaky=downstream`。这意味着更关注最新画面。完整录像分支一般不这样丢帧，应监控磁盘和写入速度。不要在编码后的任意 H.264 buffer 上随意丢数据，否则可能破坏参考关系，持续花屏直到后续可恢复点。[queue](https://gstreamer.freedesktop.org/documentation/coreelements/queue.html)

配套 `pipeline.py` 演示一个真正的应用如何接收 ERROR/EOS、记录处理帧率和执行正常退出。命令行验证以后再读它：理解 `Gst.init`、`parse_launch`、bus watch、GLib 主循环、PLAYING/NULL 状态。它故意不包含自动无限重启，避免把反复失败伪装成稳定服务。

## 3.8 音频入门实验

音频的原始数据一般称 PCM。48 kHz 表示每声道每秒 48,000 个采样点；S16_LE 表示有符号 16 位小端采样；双声道 PCM 的数据率是 `48000 × 16 × 2 = 1.536 Mbit/s`。AAC 和 Opus 是压缩格式，WAV 常用来包装 PCM；这些名称不处在同一层。

```bash
arecord -l
arecord -L
# 先把 AUDIO 换成 arecord 输出中真实可用的录音设备
export AUDIO=plughw:REPLACE_CARD,REPLACE_DEVICE
arecord -D "$AUDIO" -f S16_LE -r 48000 -c 1 -d 5 mic.wav
aplay mic.wav
```

`hw` 更直接地对应硬件能力，`plughw` 可以做部分格式适配。出现无声先检查声卡、输入源、capture 开关、增益和接线；音频 Codec 一词在板级电路里也可指 ADC/DAC 芯片，不等于 AAC 编码库。[ALSA arecord/aplay 手册](https://github.com/alsa-project/alsa-utils/blob/master/aplay/aplay.1)

**本章验收**：有测试图软件编码文件、测试图硬件编码文件和真实相机编码文件；能指出每条 pipeline 中哪一段发生压缩；能够解释一次 caps 错误；单独录制一段可听见的声音。
