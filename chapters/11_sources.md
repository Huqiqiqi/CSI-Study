# 参考资料与适用范围

本书资料核对日期为 2026 年 10 月 14 日。下列链接优先使用板卡厂商、标准组织、Linux 内核和软件项目自己的文档。网页会更新，实际开发以你固定下来的 SDK、源码 commit、插件帮助和实测输出为准。图形是本书绘制的教学示意，不是板卡原理图或实测性能图。

## 正点原子板卡资料

- [RK3588 资料下载入口](http://www.openedv.com/docs/boards/arm-linux/RK3588Linux.html)：用户提供的产品资料入口，包含基础资料、SDK 和开发环境入口。网页内容已读取；未下载或验证整个 SDK。
- [MIPI 摄像头硬件接口](https://wiki.alientek.com/docs/Boards/Linux/DLRK3588/DLRK3588%20硬件参考手册/describe/3.13/)：用于确认该手册板型的连接器、lane 与供电/信号要求。使用自己的底板修订版原理图做最终接线依据。
- [摄像头测试与 R8 四路更新](https://wiki.alientek.com/docs/Boards/Linux/DLRK3588/DLRK3588%20快速体验手册/function_test/3.8_camera/)：用于区分早期双路配置与指定 R8 SDK 四路 IMX415 支持，节点编号仅保留为有版本边界的参考。

## CSI 与 Linux 摄像头开发

- [MIPI CSI-2 官方概览](https://www.mipi.org/specifications/csi-2)：协议定位和发展范围；具体寄存器和电气设计需另查完整适用规范与模组资料。
- [Linux sensor 驱动编写](https://cdn.kernel.org/doc/html/latest/driver-api/media/camera-sensor.html)：时钟、电源和驱动职责。当前主线接口不能机械照搬到旧 BSP。
- [Linux sensor 用户接口与时序](https://cdn.kernel.org/doc/html/latest/userspace-api/media/drivers/camera-sensor.html)：曝光、blanking 和帧间隔的理解。
- [CSI 发射器与接收器接口](https://cdn.kernel.org/doc/html/latest/driver-api/media/tx-rx.html)：bus code、link frequency 和总线速率关系。
- [Linux RKCIF](https://cdn.kernel.org/doc/html/latest/admin-guide/media/rkcif.html)：CIF 的模块组织与主线表示，不能当成指定正点原子 BSP 拓扑输出。
- [V4L2 sub-device](https://docs.kernel.org/userspace-api/media/v4l/dev-subdev.html)：内部子设备的格式与控制边界。
- [V4L2 MMAP](https://docs.kernel.org/userspace-api/media/v4l/mmap.html)、[申请 buffer](https://docs.kernel.org/userspace-api/media/v4l/vidioc-reqbufs.html)、[入队与出队](https://docs.kernel.org/userspace-api/media/v4l/vidioc-qbuf.html)、[启停流](https://docs.kernel.org/userspace-api/media/v4l/vidioc-streamon.html)：用户态采集流程。
- [NV12 与相关像素格式](https://www.kernel.org/doc/html/latest/userspace-api/media/v4l/pixfmt-nv12.html)：内存布局。
- [V4L2 control 框架](https://docs.kernel.org/driver-api/media/v4l2-controls.html)：控制项与驱动的接口。
- [Linux I²C 客户端驱动](https://docs.kernel.org/i2c/writing-clients.html)：寄存器读写辅助函数和 I²C 传输的职责。
- [DMA-BUF](https://docs.kernel.org/driver-api/dma-buf.html)：共享 buffer 与同步。
- [设备树 binding 原则](https://www.kernel.org/doc/html/latest/devicetree/bindings/writing-bindings.html)、[外部模块构建](https://www.kernel.org/doc/html/latest/kbuild/modules.html)：开发与版本匹配。

## Rockchip 与音视频框架

- [Rockchip IMX415 develop-6.1 源码](https://github.com/rockchip-linux/kernel/blob/develop-6.1/drivers/media/i2c/imx415.c)：驱动阅读对照。该分支会变化，请在开发记录中固定 commit。
- [Rockchip MPP](https://github.com/rockchip-linux/mpp)：编解码软件框架与示例入口。
- [RKNN Toolkit2](https://github.com/rockchip-linux/rknn-toolkit2)：NPU 模型部署入口。
- [GStreamer v4l2src](https://gstreamer.freedesktop.org/documentation/video4linux2/v4l2src.html)、[tee](https://gstreamer.freedesktop.org/documentation/coreelements/tee.html)、[queue](https://gstreamer.freedesktop.org/documentation/coreelements/queue.html)、[splitmuxsink](https://gstreamer.freedesktop.org/documentation/multifile/splitmuxsink.html)：采集、分支、缓冲与录像。
- [GStreamer 多线程教程](https://gstreamer.freedesktop.org/documentation/tutorials/basic/multithreading-and-pad-availability.html)：分支与线程的关系。
- [GStreamer bus](https://gstreamer.freedesktop.org/documentation/application-development/basics/bus.html)、[playbin](https://gstreamer.freedesktop.org/documentation/playback/playbin.html)、[kmssink](https://gstreamer.freedesktop.org/documentation/kms/index.html)、[x264enc](https://gstreamer.freedesktop.org/documentation/x264/index.html)：应用消息、播放、显示与软件编码。
- [FFmpeg 命令文档](https://ffmpeg.org/ffmpeg.html)、[容器格式文档](https://ffmpeg.org/ffmpeg-formats.html)：编码、复制码流与容器选项。
- [ALSA 录放音工具手册](https://github.com/alsa-project/alsa-utils/blob/master/aplay/aplay.1)：音频设备与 PCM 实验。

## 网络与浏览器

- [MediaMTX 安装](https://mediamtx.org/docs/kickoff/install)、[配置参考](https://mediamtx.org/docs/references/configuration-file)：部署与版本相关字段。
- [GStreamer 发布](https://mediamtx.org/docs/publish/gstreamer)、[浏览器读取](https://mediamtx.org/docs/read/web-browsers)：RTSP 发布和网页嵌入。
- [WebRTC 兼容与连接](https://mediamtx.org/docs/features/webrtc-specific-features)：编解码限制、媒体通道和 NAT 排查。
- [身份验证](https://mediamtx.org/docs/features/authentication)、[服务端录像](https://mediamtx.org/docs/features/record)：访问控制和后续工程扩展。

## 使用资料时保留判断

第一优先级是你这块板、这个 SDK 的原理图和实现；第二是相关框架的接口文档；第三是其他板卡示例。不要把另一块 RK3588 的 GPIO、时钟编号、video 节点直接套过来。文档中的历史示例也可能存在容器扩展名或参数不一致，遇到矛盾时用实际 caps、码流分析和版本源码验证。

本书保留了用户给定的九章框架；九张截图本身主要是课程列表，不作为硬件规格证据。正文中的命令分为可在具备依赖的系统执行的示例、需要替换板级参数的示例，以及明确标注的伪代码。未知寄存器、电源时序和引脚不作猜测。
