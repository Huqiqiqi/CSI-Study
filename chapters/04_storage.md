# 第四章 视频封装与本地存储

## 4.1 容器像一本带目录的相册

H.264 码流是压缩后的图像内容，MP4、MKV、TS 是组织这些内容与时间信息的容器。把 TS 文件命名成 `.mp4` 不会改变它的格式。排错时看 `ffprobe` 的 `format_name`，不要只看后缀。

| 形式 | 适合的入门用途 | 注意事项 |
| --- | --- | --- |
| H.264 裸流 | 检查编码器输出与参数集 | 时间信息和随机定位能力有限 |
| MP4 | 普通录像、浏览器点播 | 常规写法需要正常收尾 |
| 分片 MP4 | 分段、流式或特定录像设计 | 播放器兼容和索引仍需测试 |
| MPEG-TS | 传输和某些抗中断场景 | 无法保证断电不丢尾部数据 |
| MKV | 多种轨道与灵活容器需求 | 浏览器直接播放能力不统一 |

重新封装使用 `-c copy` 时可以保留原始压缩数据，通常不重新损失画质；转换编码才需要解码和再编码。滤镜、缩放、烧字幕一般不能只靠 copy 完成。

## 4.2 实验 8 做十秒可检查录像

```bash
# 在 examples 中，先按 README 配置 env.sh
bash 01_camera.sh record
ffprobe -v error -show_streams -show_format recordings/你的文件.mp4
ffmpeg -v error -i recordings/你的文件.mp4 -f null -
```

脚本按 `COUNT` 限定帧数，默认 300 帧；30 fps 时目标约十秒。最后一条把整个文件解码后丢弃，检查是否有明显解码错误；成功不能单独证明画面颜色或音画同步正确，还要观看。

也可以从已有测试片转出第一张缩略图：

```bash
ffmpeg -i test-pattern.mp4 -frames:v 1 thumbnail.png
```

默认文件存在时 FFmpeg 会询问是否覆盖。学习中优先使用独立实验目录，不要长期复用同一个录像文件名。

## 4.3 实验 9 自动分段录像

长时间把所有内容写到一个大 MP4，异常退出可能影响整个文件。先使用 `splitmuxsink` 按目标时间切成多个文件，让已经关闭的分段独立保存。它通常依赖关键帧边界，设 60 秒不代表每段精确到 60.000 秒。[splitmuxsink](https://gstreamer.freedesktop.org/documentation/multifile/splitmuxsink.html)

```bash
mkdir -p recordings
gst-launch-1.0 -e -v \
    v4l2src device="$CAM" io-mode=mmap \
    ! video/x-raw,format=NV12,width=1920,height=1080,framerate=30/1 \
    ! mpph264enc ! h264parse \
    ! splitmuxsink location="recordings/cam0-%05d.mp4" \
        max-size-time=60000000000
```

实际使用配套脚本 `bash 01_camera.sh segments`，会创建唯一会话目录，避免重启后又从 `00000` 开始覆盖旧片段。持续录像需要主动按 Ctrl+C 正常结束；正式后台服务要捕获退出信号、发送 EOS、等待文件收尾，再退出。

将目标关键帧间隔设置为可接受的数值后，查看每个分段时长与首帧可解码性。若编码器迟迟不给合适关键帧，分段会超长。不要靠强制切字节把压缩视频切成不可独立解码的片段。

## 4.4 MP4 与断电 你能承诺到哪里

常规 MP4 的索引信息可能在结束时完成；`faststart` 主要帮助点播时较早读取索引，不等于防断电。分片 MP4 可降低某些中断的影响，例如 FFmpeg 的 fragment 相关选项，但依然存在未落盘数据、文件系统和存储设备缓存。需结合具体播放器测试。[FFmpeg 容器选项](https://ffmpeg.org/ffmpeg-formats.html)

产品策略可以是小段录像、临时文件名、关闭后再原子改名、写入完成记录、按需要做文件与目录同步、限制日志增长，以及掉电保护。每一种策略都有吞吐与寿命成本。第一次验收先用进程正常退出和异常终止模拟，不要在唯一工作介质上反复强制断电。

## 4.5 存储容量不是摄像头像素数直接决定的

编码录像的粗略容量：`GB/天 ≈ 总码率(Mbit/s) × 10.8`，使用十进制 GB。每路 4 Mbit/s 是约 43.2 GB/天；四路是 172.8 GB/天，七天约 1.21 TB。还没有计算音频、容器、索引、日志、码率波动和可用空间余量。

反过来，1 TB 可用空间在四路合计 16 Mbit/s 下理论约保存 5.79 天。若你的业务要求七天，需要调整码率、保存策略或容量。网页内提供计算器帮助你比较，结果都是预算，不是实际画质或性能承诺。

磁盘要同时满足持续写入速度、最差写延迟、容量、掉电行为和耐久性。SD 卡标称速度不代表长时间随机负载下表现；在多路系统中记录写延迟、剩余容量和是否开始背压，远比仅看平均 MB/s 更有用。

## 4.6 实验 10 加入音频轨道

确认单独录音成功，且 `avenc_aac`、`aacparse` 可用后，再将音视频放入同一 pipeline：

```bash
gst-launch-1.0 -e -v mp4mux name=mux \
    ! filesink location=camera-with-audio.mp4 \
    v4l2src device="$CAM" io-mode=mmap \
    ! video/x-raw,format=NV12,width=1920,height=1080,framerate=30/1 \
    ! queue ! mpph264enc ! h264parse ! queue ! mux.video_0 \
    alsasrc device="$AUDIO" \
    ! audioconvert ! audioresample \
    ! audio/x-raw,rate=48000,channels=1 \
    ! avenc_aac ! aacparse ! queue ! mux.audio_0
```

录几秒后 Ctrl+C 正常结束，用 ffprobe 确认视频与音频两条 stream。镜头前拍手，同时录到拍手声，检查声画相对时间。共同 pipeline 有利于统一时钟，但不保证硬件时钟没有漂移；两小时实验比十秒实验更能发现问题。

**本章验收**：分段文件可以逐个播放；退出后末段能读取；容量预算包含音频与余量；能说清“扩展名、容器、编码”之间的区别。
