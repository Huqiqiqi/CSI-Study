"""Original SVG teaching diagrams. No external images, fonts or network assets."""
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets'
OUT.mkdir(exist_ok=True)
INK = '#17324d'
BLUE = '#e7f1fb'
GREEN = '#e5f4ed'
ORANGE = '#fff0d9'
PURPLE = '#eee9f8'
RED = '#f9e5e5'


class Figure:
    def __init__(self, number, title, subtitle, height=620):
        self.height = height
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img">',
            f'<title>{escape(title)}</title><desc>{escape(subtitle)}</desc>',
            '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#5b7690"/></marker></defs>',
            f'<rect width="1120" height="{height}" rx="16" fill="#f8fafc"/>',
            '<style>text{font-family:"Microsoft YaHei","Noto Sans CJK SC",sans-serif;fill:#17324d} .muted{fill:#526b82}</style>']
        self.text(36, 48, f'{number:02d}  {title}', 28, weight=700)
        self.text(36, 80, subtitle, 18, color='#526b82')

    def text(self, x, y, label, size=20, anchor='start', weight=400, color=INK):
        self.parts.append(f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" font-weight="{weight}" style="fill:{color}">{escape(str(label))}</text>')

    def box(self, x, y, w, h, title, lines=(), fill=BLUE):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="#bacbda"/>')
        self.text(x+w/2, y+35, title, 23, 'middle', 700)
        for i, line in enumerate(lines):
            self.text(x+w/2, y+67+i*27, line, 19, 'middle')

    def arrow(self, points, label='', lx=None, ly=None, dashed=False):
        d = 'M' + ' L'.join(f'{x},{y}' for x,y in points)
        dash = 'stroke-dasharray="7 5"' if dashed else ''
        self.parts.append(f'<path d="{d}" fill="none" stroke="#5b7690" stroke-width="2.5" marker-end="url(#arrow)" {dash}/>')
        if label:
            self.text(lx, ly, label, 18, 'middle', color='#526b82')

    def note(self, text, y=None):
        self.text(36, self.height-25 if y is None else y, text, 18, color='#526b82')

    def save(self, name):
        (OUT/name).write_text('\n'.join(self.parts+['</svg>']), encoding='utf-8')


f=Figure(1,'从镜头到浏览器','主链路承载视频；音频与监控在对应位置汇合。')
for x,t,ls,c in [(40,'摄像头',['光 → RAW','I²C 控制 / CSI 输出'],BLUE),(400,'RK3588 采集与 ISP',['PHY → CSI → CIF','RAW → YUV / NV12'],GREEN),(760,'硬件视频编码',['MPP / 编码器','像素 → H.264'],ORANGE)]:
    f.box(x,125,310,130,t,ls,c)
f.arrow([(350,190),(400,190)])
f.arrow([(710,190),(760,190)])
f.box(40,350,310,130,'声音输入',['麦克风 / I²S / USB','ALSA → AAC 或 Opus'],PURPLE)
f.box(400,350,310,130,'封装与分发',['MP4 分段保存','RTSP → 媒体服务器'],ORANGE)
f.box(760,350,310,130,'观看端',['WebRTC / HLS','解码 → 屏幕与声音'],BLUE)
f.arrow([(915,255),(915,300),(555,300),(555,350)])
f.arrow([(350,415),(400,415)])
f.arrow([(710,415),(760,415)])
f.text(560,545,'元数据 · 时间戳 · 错误监控 · 资源预算贯穿全程',23,'middle',700)
f.note('入门顺序：测试图 → 单路采集 → 编码 → 录像 → 网页 → 音频 → 多路。')
f.save('01_overview.svg')

f=Figure(2,'一颗摄像头的三条通路','图像通路正常与控制通路正常，需要分别验证。')
f.box(40,160,255,290,'摄像头模组',['镜头与传感器','','控制寄存器','','像素输出'],GREEN)
f.box(825,160,255,290,'RK3588 开发板',['I²C 控制器','','MIPI PHY / CSI','','电源 时钟 GPIO'],BLUE)
f.arrow([(825,210),(295,210)],'控制：I²C / CCI',560,195)
f.arrow([(295,310),(825,310)],'图像：CSI-2 over D-PHY',560,295)
f.arrow([(825,410),(295,410)],'基础条件：供电 / XCLK / RESET',560,395)
f.text(560,515,'能读 ID ≠ 能持续收到正确图像',27,'middle',700)
f.note('差分高速信号遵循 PHY 规范；供电电压不能直接当成所有引脚的信号电压。')
f.save('02_sensor_paths.svg')

f=Figure(3,'包组成行 行组成帧','简化示意：具体封装与可选功能以传感器和接收器支持的规范版本为准。')
f.box(40,130,190,100,'帧开始',['短包 / 帧边界'],PURPLE)
f.box(270,130,540,100,'多个图像长包',['有效载荷包含像素样本'],BLUE)
f.box(850,130,230,100,'帧结束',['短包 / 帧边界'],PURPLE)
f.arrow([(230,180),(270,180)]); f.arrow([(810,180),(850,180)])
f.box(80,300,250,120,'包头',['数据类型 / VC','包头 ECC'],ORANGE)
f.box(360,300,420,120,'Payload',['RAW10 / RAW12 / YUV…','线侧布局与内存布局可不同'],GREEN)
f.box(810,300,230,120,'包尾',['载荷 CRC'],ORANGE)
f.arrow([(330,360),(360,360)]); f.arrow([(780,360),(810,360)])
f.text(560,490,'VC 是同一链路内的逻辑流标识；lane 是物理数据通道。',23,'middle',700)
f.note('CRC/ECC 错误优先排查传输与时序；它们不是 MP4 或 RTSP 层的错误。')
f.save('03_packets.svg')

f=Figure(4,'同一画面的三种表示','以下都是未压缩图像表示；H.264 是另一层的压缩编码。')
f.text(205,135,'Bayer RAW',24,'middle',700)
colors={'R':'#f5b5b5','G':'#b9e1c5','B':'#b8d5f3'}
for row in range(4):
    for col in range(4):
        ch=(('R','G'),('G','B'))[row%2][col%2]
        x,y=65+col*70,160+row*60
        f.parts.append(f'<rect x="{x}" y="{y}" width="66" height="56" fill="{colors[ch]}" rx="5"/>')
        f.text(x+33,y+37,ch,24,'middle',700)
f.text(205,445,'每位置只有一种颜色样本',20,'middle')
f.text(550,135,'RGB888',24,'middle',700)
for i,(ch,color) in enumerate(colors.items()):
    f.box(420+i*87,160,80,240,ch,[],color)
f.text(550,445,'每像素 R G B 三个分量',20,'middle')
f.text(915,135,'NV12',24,'middle',700)
f.box(770,160,290,150,'Y 亮度平面',['宽 × 高'],BLUE)
f.box(770,325,290,75,'UV UV UV…',[],GREEN)
f.text(915,445,'4:2:0 色度 / UV 交错',20,'middle')
f.text(560,515,'无额外对齐的 1080p NV12：2,073,600 + 1,036,800 = 3,110,400 字节',21,'middle',700)
f.note('实际大小以驱动报告的 stride、sizeimage 和 plane 数据为准。')
f.save('04_formats.svg')

f=Figure(5,'Linux 摄像头栈','应用看到设备节点；驱动和媒体拓扑管理节点背后的硬件。')
f.box(40,120,1040,85,'应用层',['v4l2-ctl / GStreamer / 自己的 C 或 Python 程序'],BLUE)
f.box(40,245,310,110,'/dev/videoX',['图像 / RAW / 统计等','必须识别节点职责'],GREEN)
f.box(405,245,310,110,'/dev/mediaX',['entity / pad / link','观察连接与路由'],ORANGE)
f.box(770,245,310,110,'/dev/v4l-subdevX',['sensor 等内部模块','格式与控制'],PURPLE)
f.arrow([(195,205),(195,245)]); f.arrow([(560,205),(560,245)]); f.arrow([(925,205),(925,245)])
f.box(40,405,1040,115,'内核与硬件',['sensor → PHY → CSI receiver → CIF/VICAP → ISP → 图像 buffer','实际直通 / DDR 读回 / 虚拟 ISP 路由依 BSP 而定'],BLUE)
for x in [195,560,925]: f.arrow([(x,355),(x,405)])
f.note('设备树描述连接与资源；驱动执行操作；IQ 与 3A 影响图像质量。')
f.save('05_linux_stack.svg')

f=Figure(6,'buffer 是需要归还的周转箱','MMAP 映射内存；QBUF 与 DQBUF 转移使用权。')
f.box(70,140,330,120,'应用持有空 buffer',['初始化 REQBUFS / mmap','后续循环重复利用'],BLUE)
f.box(720,140,330,120,'驱动持有空 buffer',['QBUF 后等待硬件','DMA 写入图像'],GREEN)
f.box(720,375,330,120,'一帧完成',['记录时间戳 / sequence','应用 poll 等待完成'],ORANGE)
f.box(70,375,330,120,'应用使用这一帧',['DQBUF 后读取','完成使用再归还'],PURPLE)
f.arrow([(400,200),(720,200)],'QBUF',560,180)
f.arrow([(885,260),(885,375)])
f.arrow([(720,435),(400,435)],'DQBUF',560,415)
f.arrow([(235,375),(235,260)],'用完回收',135,325)
f.note('QBUF 后不能继续无约束使用旧指针；异步编码和 AI 需要引用与同步设计。')
f.save('06_buffers.svg')

f=Figure(7,'像素 编码 容器与网络分层','每个工位改变的东西不同，排错时要定位到相应层。')
for x,t,l,c in [(40,'原始像素',['RAW / RGB / NV12','大体积图像'],GREEN),(400,'压缩码流',['H.264 / H.265','编码器减少数据量'],ORANGE),(760,'组织与发送',['MP4 / TS / RTSP','封装或传输'],BLUE)]:f.box(x,140,310,140,t,l,c)
f.arrow([(350,210),(400,210)]);f.arrow([(710,210),(760,210)])
f.box(40,360,310,130,'编码器',['mpph264enc / x264enc','像素 → 压缩数据'],ORANGE)
f.box(400,360,310,130,'解析器',['h264parse','整理已有压缩数据'],PURPLE)
f.box(760,360,310,130,'封装器',['mp4mux / mpegtsmux','组织轨道与时间'],BLUE)
f.note('文件后缀不能转换容器；parser 不做视频压缩；协议转换不等于转码。')
f.save('07_codec_container.svg')

f=Figure(8,'一个发布者 多种观看方式','先把媒体服务放在板端；远程部署时再替换服务器地址。')
f.box(40,175,285,190,'RK3588 发布者',['CSI → NV12 → H.264','','RTSP TCP 发布'],GREEN)
f.box(425,175,285,190,'MediaMTX',['接收 / 路由 / 分发','','不自动替你转码'],ORANGE)
f.box(810,115,270,110,'原生播放器',['RTSP :8554'],BLUE)
f.box(810,280,270,110,'浏览器 WebRTC',['HTTP :8889 + 媒体'],PURPLE)
f.box(810,445,270,110,'浏览器 HLS',['HTTP :8888'],BLUE)
f.arrow([(325,270),(425,270)],'压缩流',375,250)
f.arrow([(710,220),(760,220),(760,170),(810,170)])
f.arrow([(710,270),(780,270),(780,335),(810,335)])
f.arrow([(710,320),(740,320),(740,500),(810,500)])
f.text(385,445,'板端 localhost = 板端自己',22,'middle',700)
f.text(385,485,'电脑观看时填写开发板 IP',22,'middle',700)
f.note('网页握手成功不等于媒体可达；WebRTC 示例还需 UDP 8189 可达。')
f.save('08_network.svg')

f=Figure(9,'延迟是一段段累积的','图中长度仅表示处理顺序，不表示各段实测耗时。')
labels=[('曝光与读出',GREEN),('ISP 与缓存',BLUE),('编码与队列',ORANGE),('网络',PURPLE),('解码与显示',BLUE)]
for i,(label,c) in enumerate(labels):
    x=40+i*215
    f.box(x,175,190,120,label,[],c)
    f.text(x+95,255,f'T{i+1}',24,'middle')
    if i<4:f.arrow([(x+190,235),(x+215,235)])
f.text(560,380,'总延迟 ≈ T1 + T2 + T3 + T4 + T5',29,'middle',700)
f.text(560,450,'30 fps 时，积压 10 帧的队列约增加 333 ms',26,'middle',700)
f.text(560,515,'测量：同时记录现实中的计时器与播放屏幕，重复采样。',21,'middle')
f.note('先检查本地积压，再调整网络；不要把 sync=false 当作通用优化。')
f.save('09_latency.svg')

f=Figure(10,'声音与图像共用呈现时间线','时间戳必须保留语义；长时间漂移不能只靠固定偏移解决。')
f.text(45,175,'视频',23,weight=700)
for i in range(7):
    x=150+i*125
    f.box(x,130,105,80,f'帧 {i}',[],BLUE)
    f.text(x+52,245,f'{i*33.3:.1f} ms',17,'middle')
f.text(45,340,'音频',23,weight=700)
for i in range(11):
    x=150+i*80
    f.parts.append(f'<rect x="{x}" y="295" width="76" height="80" rx="6" fill="{GREEN}" stroke="#bacbda"/>')
f.text(590,410,'连续采样，按时间戳与共同播放时钟对齐',22,'middle')
f.arrow([(150,465),(1045,465)])
f.text(560,510,'固定偏移：启动 / 缓冲差异    漂移：硬件时钟速率差异',22,'middle',700)
f.note('多路同时启动 ≠ 同时曝光；需要同步采集时另行设计传感器触发。')
f.save('10_sync.svg')

f=Figure(11,'多路需要共享资源预算','每路单独通过，再测试同时运行；不由接口数推断总吞吐。')
for i in range(4):
    f.box(35,115+i*105,210,80,f'cam{i}',[],BLUE)
    f.arrow([(245,155+i*105),(330,155+i*105)])
f.box(330,115,400,395,'共同资源',['PHY / CSI / CIF 路由','','ISP 处理能力与 DDR','','MPP 编码并发与吞吐','','电源 / 温度 / buffer'],ORANGE)
f.box(825,145,255,110,'本地录像',['总码率 / 写延迟'],GREEN)
f.box(825,345,255,110,'网络与浏览器',['总带宽 / 播放能力'],PURPLE)
f.arrow([(730,210),(825,210)]); f.arrow([(730,400),(825,400)])
f.text(560,552,'扩展顺序：单路 → 双路 → 四路 → 长时间与故障演练',22,'middle',700)
f.note('虚拟 ISP 节点不是独立硬件；四路可打开不等于目标帧率全部达成。')
f.save('11_multicam.svg')

f=Figure(12,'AI 旁路与主视频解耦','AI 处理慢时优先保留最新输入，主录像仍按自己的要求推进。')
f.box(40,190,260,140,'ISP 输出 NV12',['camera_id / PTS','原始图像 buffer'],GREEN)
f.box(425,120,280,130,'主视频分支',['硬件编码','录像 / 推流'],BLUE)
f.box(425,360,280,140,'AI 输入分支',['有界队列 / 抽帧','缩放 / 颜色 / 量化'],ORANGE)
f.box(810,360,270,140,'NPU 推理',['RKNN 模型','检测结果 + 时间戳'],PURPLE)
f.box(810,120,270,130,'结果呈现',['框 / 元数据','按帧身份匹配'],BLUE)
f.arrow([(300,235),(355,235),(355,185),(425,185)])
f.arrow([(300,290),(355,290),(355,430),(425,430)])
f.arrow([(705,430),(810,430)]);f.arrow([(945,360),(945,250)])
f.arrow([(705,185),(810,185)],dashed=True)
f.note('缩放与 letterbox 后要还原坐标；不要持有已经归还驱动的旧 buffer 指针。')
f.save('12_ai.svg')

print(f'Created {len(list(OUT.glob("*.svg")))} SVG diagrams in {OUT}')
