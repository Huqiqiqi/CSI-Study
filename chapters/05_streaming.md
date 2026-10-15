# 第五章 实时流媒体与网页播放

## 5.1 先分清发布者 服务器和观看者

RK3588 采集并编码，是发布者；MediaMTX 接收和分发压缩媒体，是服务器；浏览器是观看者。最初服务器也在 RK3588 上，因此发布地址可以用 `127.0.0.1`。电脑浏览器里的 `127.0.0.1` 却指电脑自己，必须改成开发板局域网 IP。

![图 8 从 RK3588 发布到浏览器](assets/08_network.svg)

RTSP 常用来控制媒体会话，视频通常通过 RTP 传输；采用 TCP interleaved 时媒体可以复用 RTSP TCP 连接。RTMP 常用于向直播平台发送流；HLS/DASH 用 HTTP 分发分段媒体；SRT 常用于弱网传输；WebRTC 适合交互性较强的浏览器实时播放。它们不等同于 H.264/H.265。

| 路线 | 适合先做什么 | 主要代价 |
| --- | --- | --- |
| RTSP → 原生播放器 | 检查网络推流是否正常 | 浏览器 video 标签通常不能直接播放 |
| HLS → 浏览器 | 先获得稳定的网页画面 | 切片与播放缓冲通常增加延迟 |
| WebRTC → 浏览器 | 降低交互等待 | 需要兼容编码和可达的媒体连接 |
| SRT → 接收服务器 | 探索丢包和抖动环境 | 浏览器端通常还需其他分发方式 |

不在本书给出“某协议必然只有 50 ms”这类保证。分辨率、GOP、编码器、队列、网络和浏览器共同决定延迟。先完成 HLS 或 WebRTC 的局域网闭环，再测量和优化。

## 5.2 实验 11 启动局域网媒体服务器

从 [MediaMTX 官方安装入口](https://mediamtx.org/docs/kickoff/install) 选择匹配板端 `uname -m` 和系统的发行包。常见 RK3588 Linux 是 aarch64，对应 Linux ARM64；不要下载 Windows 或 x86_64 包。记录版本，使用该发行包自带配置核对字段。教材核对时官方配置参考页标注 v1.21.2，未来版本变化需要重新确认。[配置参考](https://mediamtx.org/docs/references/configuration-file)

将可执行程序和 `mediamtx.local.yml` 放在板端，运行：

```bash
./mediamtx --version
./mediamtx mediamtx.local.yml
```

保持此终端运行，查看监听日志。配套配置只开放 `cam0` 到 `cam3` 路径，允许本机发布，并限制匿名读取来自回环和常见私网地址。它适用于你信任的实验局域网；连接反向代理、VPN 或路由转发时，要重新设计访问权限。外部设备发布会被拒绝，需要另行配置明确的发布权限。

最关键的地址约定如下，实际以配置和启动日志为准：

| 用途 | 示例地址 | 协议与端口 |
| --- | --- | --- |
| 板端发布 cam0 | `rtsp://127.0.0.1:8554/cam0` | RTSP TCP 8554 |
| 电脑检查 RTSP | `rtsp://开发板IP:8554/cam0` | RTSP TCP 8554 |
| 浏览器 HLS 页面 | `http://开发板IP:8888/cam0` | HTTP TCP 8888 |
| 浏览器 WebRTC 页面 | `http://开发板IP:8889/cam0` | HTTP TCP 8889 |
| WebRTC 媒体 | 通过协商连接开发板 | 示例 UDP 8189 |

HTTP 页面能打开只证明网页端口可达，不证明 WebRTC 媒体连接已经建立。MediaMTX 支持多协议分发，但不会凭空把任何视频转码成任意浏览器支持的格式。[服务架构概览](https://mediamtx.org/docs/kickoff/introduction)

## 5.3 实验 12 用测试图证明网络链路

确认 `rtspclientsink` 可用，在另一个板端终端运行：

```bash
gst-launch-1.0 -e -v \
    videotestsrc is-live=true \
    ! video/x-raw,format=I420,width=640,height=360,framerate=30/1 \
    ! x264enc tune=zerolatency speed-preset=ultrafast \
        bitrate=1000 key-int-max=30 bframes=0 \
    ! video/x-h264,profile=baseline \
    ! h264parse \
    ! rtspclientsink protocols=tcp location=rtsp://127.0.0.1:8554/cam0
```

服务器应报告收到发布流。电脑用播放器测试 RTSP，再用浏览器打开上表的 WebRTC 或 HLS 页面。只有测试图完整通过，才替换 CSI 输入。官方 GStreamer 发布路线使用 `rtspclientsink`，它会选择合适的 RTP payloader；不要照抄另一种 UDP pipeline，把 `rtph264pay` 再随意塞在它前面。[GStreamer 发布说明](https://mediamtx.org/docs/publish/gstreamer)

如果设备缺少 rtspclientsink，可先把已编码 MP4 用 FFmpeg 复制发布，独立检验服务：

```bash
ffmpeg -re -stream_loop -1 -i test-pattern.mp4 \
    -an -c:v copy -f rtsp -rtsp_transport tcp \
    rtsp://127.0.0.1:8554/cam0
```

`-re` 用于让文件接近实时速度读取；不用每次为推流重新编码。文件源与实时摄像头的时钟行为不同，不要机械给所有实时输入套用 `-re`。[FFmpeg 命令文档](https://ffmpeg.org/ffmpeg.html)

## 5.4 实验 13 换成 CSI 和硬件编码

```bash
gst-launch-1.0 -e -v \
    v4l2src device="$CAM" io-mode=mmap \
    ! video/x-raw,format=NV12,width=1920,height=1080,framerate=30/1 \
    ! mpph264enc ! h264parse \
    ! rtspclientsink protocols=tcp location=rtsp://127.0.0.1:8554/cam0
```

这条命令验证硬件默认输出能否发布。WebRTC 若黑屏，先查看编码 profile、B 帧、参数集和关键帧间隔。根据实际 mpph264enc 属性配置无 B 帧、目标 profile 和码率，再检查生成的文件，而不是把 caps 写成 baseline 就假定码流已经自动变成 baseline。

HLS 能播放而 WebRTC 不行时，优先比较编解码兼容性和 ICE 网络路径。H.264 的存在本身不能确保所有参数都被浏览器接受；H.265 的兼容性限制更多。首轮只传视频，音频成功后再合并。

## 5.5 实验 14 做自己的网页

配套 `examples/player.html` 是没有外部 CDN 依赖的实验页面。填写开发板地址、选择 cam0 至 cam3、选择 WebRTC 或 HLS，然后点击连接。它嵌入 MediaMTX 自带播放器页面，不自行实现 WebRTC 协议。实际播放需要媒体服务在线。

最小嵌入代码如下，把地址换成你的开发板：

```html
<iframe
  src="http://192.168.1.50:8889/cam0"
  title="摄像头画面"
  allow="autoplay; fullscreen"
  style="width:100%;aspect-ratio:16/9;border:0">
</iframe>
```

先用 MediaMTX 页面确认能播放，再嵌入。iframe 方案简单，但跨源时无法直接读取内部 video 的统计信息，也不适合在前端硬编码秘密。需要细粒度控制时研究官方 reader.js/WHEP 接口和鉴权流程。[浏览器读取与嵌入](https://mediamtx.org/docs/read/web-browsers)

## 5.6 怎样同时录像和推流

有两种容易理解的起点。第一种：板端只编码和发布，媒体服务器从同一压缩流录制；这样避免重复采集和重复编码。第二种：编码后 tee 出录像与推流两个分支，各自加 queue、parser 和合适 sink。第二种的网络异常可能影响整个 pipeline，需要应用处理分支失败与背压。

不要简单启动两个独立的 `v4l2src` 去竞争同一个摄像头节点。也不要为了“一路录像一路直播”默认把同样画面编码两遍。若两种用途需要不同分辨率或码率，才考虑从原始图像处分支，独立缩放和编码。

为了让第一版系统可靠，本书建议先验证“板端单次编码 → MediaMTX → 网页”，然后按第四章的方法做独立录像实验，最后依据网络故障是否允许影响录像选择组合结构。第九章给出产品化隔离策略。

## 5.7 音频在网页端的选择

AAC 常见于 MP4 和 HLS，Opus 常用于 WebRTC。不要假定带 AAC 的 RTSP 流经协议转换后浏览器 WebRTC 就一定能听到声音。若要同时覆盖 HLS 和 WebRTC，检查服务器与客户端实际支持的音轨组合，必要时为不同输出编码不同音频轨道。

一开始可以保持视频共用 H.264，仅对音频做 AAC/Opus 分支；也可以先做纯视频，避免把静音自动播放策略、音频兼容性和 CSI 问题混在一起。浏览器默认静音不意味着板端没录到声音，先查看轨道再允许播放声音。

**本章验收**：电脑浏览器看到测试图和真实 CSI 画面；知道服务器 IP 与 localhost 的区别；保存一次 WebRTC 与 HLS 延迟对比；能解释为何 RTSP 地址不能直接塞进普通 video 标签。
