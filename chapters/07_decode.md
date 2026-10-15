# 第七章 视频解码与硬件加速

## 7.1 解码是怎样的逆过程

浏览器或播放器先从网络接收数据，或从文件读取数据，再拆容器取出音视频轨道。parser 整理压缩数据，decoder 把 H.264/H.265 等恢复成像素，最后由渲染和显示系统呈现。解码输出经常是 YUV，不一定是 CPU 可直接读的 RGB 数组。

硬件解码器能减少 CPU 的压缩语法处理工作，但后续如果每帧拷贝、转换为 RGB 再绘制，仍可能很慢。性能调试必须沿整个链路观察，不能看到“硬解”两个字就宣布完成优化。

## 7.2 实验 16 先验证文件 再比较解码路径

先检查第三章生成的文件：

```bash
ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,profile,width,height,pix_fmt,has_b_frames \
    -of default=noprint_wrappers=1 csi-single.mp4
```

这条命令给出码流信息，不证明每帧都正确解码。进一步用 FFmpeg 全文件解码到空输出，或播放器观看完整片段。

在 GStreamer 相应元件可用时，对同一文件比较：

```bash
# 软件解码，不显示；用于吞吐和错误检查
gst-launch-1.0 -v filesrc location=csi-single.mp4 \
    ! qtdemux ! h264parse ! avdec_h264 ! fakesink sync=false

# 厂商硬件插件路径，不显示
gst-launch-1.0 -v filesrc location=csi-single.mp4 \
    ! qtdemux ! h264parse ! mppvideodec ! fakesink sync=false
```

短文件可能受到启动开销影响，应换成足够长且内容一致的样本。`sync=false` 表示不按播放时钟等待，适合观察处理速度；它不等于用户观看时的真实延迟。比较 CPU、耗时、错误、输出帧数和热状态，保持测试条件一致。

`decodebin`/`playbin` 会自动选择可用插件，但自动选择不保证一定走硬件。使用调试日志和生成的 pipeline 图确认实际 decoder；要评估硬件能力时，用明确的硬件元件作对照。[GStreamer playbin](https://gstreamer.freedesktop.org/documentation/playback/playbin.html)

## 7.3 MPP RGA GPU ISP NPU 的分工

| 模块 | 主要工作 | 常见误解 |
| --- | --- | --- |
| ISP | 相机 RAW 图像处理与相关参数控制 | 把它当成 H.264 编码器 |
| MPP 与编解码硬件 | 视频编码与解码的软件接口及执行路径 | 以为安装库即可补齐内核驱动 |
| RGA | 二维缩放、旋转、格式转换等 | 以为等同于神经网络推理 |
| GPU | 图形渲染和适配的计算任务 | 以为所有图像操作自动使用 GPU |
| NPU | 支持算子的神经网络推理 | 以为代替 ISP 或硬件视频编码 |

库、内核驱动、固件及应用插件共同组成可用路径。升级其中一层后，要重新验证接口兼容；不要把另一板卡的二进制库直接覆盖到当前系统。

## 7.4 零复制是端到端约束

DMA-BUF 是共享内存对象的一种机制，可以让采集、处理、编码或显示交换句柄。句柄能传过去，还不代表接收方能够直接用：线性或压缩布局、stride、modifier、对齐、缓存和同步关系都必须一致。[Linux DMA-BUF](https://docs.kernel.org/driver-api/dma-buf.html)

AFBC 等 framebuffer 压缩布局用于某些图形和视频路径，它不是网络 H.264。一个只接受线性 NV12 的模块不能直接读取任意 AFBC buffer。遇到绿屏或格式拒绝时，先确认布局转换点；把所有硬件输出都强制交给普通 CPU 图像库不是零复制。

优化顺序：先正确收帧，再消除无用的全帧复制，再减少不必要的色彩转换，再按真实需求缩放分辨率，最后考察队列和调度。保留每次改动前后的测量结果。

## 7.5 解码失败怎样定位

有文件头但首屏迟迟不出，检查是否缺少 SPS/PPS 和可随机访问帧；静态正常、运动花屏，检查丢包和参考帧关系；画面上下错位，检查 stride 和像素布局；颜色正常但亮度不对，核对色域矩阵、范围和 HDR/SDR 解释；软件解码正常而硬件失败，检查 profile、level、位深与硬件插件支持范围。

**本章验收**：用同一文件完成软硬解码对照；能区分解码失败、格式转换失败和显示失败；说明零复制需要哪些边界条件。
