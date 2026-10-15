# Copy to env.sh. This is Bash code; only source your own trusted configuration.
# Discover the actual ISP YUV output with media-ctl and v4l2-ctl first.
CAM=/dev/videoREPLACE_ME
WIDTH=1920
HEIGHT=1080
FPS=30
COUNT=300
IO_MODE=mmap
ENCODER=mpph264enc
# Optional, after checking gst-inspect-1.0 on YOUR board:
# ENC_PROPS=(bps=4000000 gop=30)
ENC_PROPS=()
RTSP_URL=rtsp://127.0.0.1:8554/cam0
OUT_DIR=./recordings
SEGMENT_NS=60000000000
