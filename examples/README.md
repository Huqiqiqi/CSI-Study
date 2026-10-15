# 板端实验文件

这些文件是 Linux 教学示例，不自动适配硬件。先完成教材第二章，确认 YUV 输出节点和可用模式。Windows 只用于阅读和编辑；Bash 和摄像头程序在板端执行。文件按 UTF-8、LF 保存。

## 第一步 获取环境清单

```bash
bash 00_probe.sh
```

脚本只读取信息并写本地诊断目录。缺失命令、无权读取日志会被记录，不会自动安装或 sudo。报告可能包含主机信息、内核命令行等，分享前自行查看内容。

## 第二步 配置真实节点

```bash
cp env.example.sh env.sh
# 用编辑器填写 CAM、WIDTH、HEIGHT、FPS 和其他参数
bash 01_camera.sh capture --dry-run
bash 01_camera.sh capture
```

`env.sh` 是会被 Bash 执行的可信本地配置，不要 source 不明来源内容。示例保留了故意无效的 CAM，防止误操作错误节点。先探测再填写，例如 `/dev/video62` 只在确实对应你的图像出口时使用。

## 第三步 编码与存储

```bash
bash 01_camera.sh record
bash 01_camera.sh segments
```

record 按 COUNT 帧结束，segments 持续运行直到正常 Ctrl+C。输出每次保存到唯一会话目录。默认只调用 mpph264enc，不自动退回软件编码；插件不存在时应先排查 BSP。ENC_PROPS 是可选 Bash 数组，确认本机 gst-inspect 属性名称与单位后填写。模板中的 bps/gop 只是条件示例，不代表每个版本都支持。

脚本 capture 使用 NV12；如果只是验证当前格式的原始收帧，使用教材第二章 v4l2-ctl 命令。宽高、帧率必须在你的 ISP 输出能力范围内。

## 第四步 推流与组合实验

```bash
./mediamtx mediamtx.local.yml
# 另开板端终端
bash 01_camera.sh publish
# publish 停止后，才能用同一摄像头做下一项
bash 01_camera.sh dual
```

配置按所装版本自带 yml 核对。只允许回环发布、私网读取 cam0 至 cam3。播放器默认端口为 8888/8889；UDP 8189 要能到达。配置不自动启用录像，dual 的录像由 GStreamer 完成。

dual 展示单次编码后的两个分支，不保证网络错误时录像持续。正式系统应按第九章实现故障隔离、EOS、重连、关键帧恢复和空间管理。不要同时用多个脚本抢同一个 CAM。

## 第五步 阅读应用级代码

```bash
python3 pipeline.py --help
python3 pipeline.py --seconds 10
python3 pipeline.py --device /dev/videoREPLACE_ME --width 1280 --height 720 --seconds 10
```

最后一条必须替换节点。默认使用测试图，输出 JSON 帧率与 PTS 统计。程序需要板端 Python GI、GStreamer introspection 及相关插件；Buildroot 应通过 SDK 配置这些依赖。此示例计数的是 pipeline 经过的 buffer，不声称能检测传感器所有丢帧；序列号检查应在 V4L2 捕获层补齐。

程序通过 bus 接收 ERROR/EOS，正常停止发送 EOS，5 秒未收尾返回失败。测试源的 fps 只是教学验证，不能代替硬件性能测试。

## 多路配置

每路复制独立 env，例如 cam0.env 和 cam1.env，分别填写 CAM 与 RTSP_URL。然后在不同终端执行：

```bash
CAM_ENV=./cam0.env bash 01_camera.sh record
CAM_ENV=./cam1.env bash 01_camera.sh record
```

先单独验证，后同时运行。所有示例未在用户实物板上执行，实机验收项目见教材与验证报告。
