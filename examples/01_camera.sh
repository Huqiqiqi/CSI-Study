#!/usr/bin/env bash
# Training helper. Does not install software or change device trees.
set -euo pipefail
mode=${1:-help}
if [[ "$mode" == help || "$mode" == --help ]]; then
    printf 'Usage: CAM_ENV=./env.sh bash 01_camera.sh {capture|record|segments|publish|dual}\n'
    printf 'Add --dry-run after the mode to inspect the pipeline without accessing hardware.\n'
    exit 0
fi
case "$mode" in capture|record|segments|publish|dual) ;; *) echo 'Unknown mode' >&2; exit 2 ;; esac
config=${CAM_ENV:-./env.sh}
[[ -f "$config" ]] || { echo "Copy env.example.sh to $config and edit it first." >&2; exit 2; }
ENC_PROPS=()
source "$config"
: "${CAM:?Set CAM}" "${WIDTH:?}" "${HEIGHT:?}" "${FPS:?}" "${COUNT:?}"
: "${OUT_DIR:?}" "${RTSP_URL:?}" "${SEGMENT_NS:?}" "${IO_MODE:?}" "${ENCODER:?}"
[[ "$CAM" =~ ^/dev/video[0-9]+$ ]] || { echo 'CAM must be your verified /dev/videoN node.' >&2; exit 2; }
for value in "$WIDTH" "$HEIGHT" "$FPS" "$COUNT" "$SEGMENT_NS"; do
    [[ "$value" =~ ^[1-9][0-9]*$ ]] || { echo 'Dimensions, counts and times must be positive integers.' >&2; exit 2; }
done
[[ "$IO_MODE" == mmap || "$IO_MODE" == dmabuf ]] || { echo 'IO_MODE must be mmap or dmabuf.' >&2; exit 2; }
[[ "$ENCODER" == mpph264enc ]] || { echo 'This hardware exercise supports mpph264enc only; use chapter 3 for software encoding.' >&2; exit 2; }
[[ "$RTSP_URL" == rtsp://* ]] || { echo 'RTSP_URL must begin with rtsp://' >&2; exit 2; }
[[ "$OUT_DIR" != *REPLACE* ]] || { echo 'Replace OUT_DIR.' >&2; exit 2; }
dry=false
[[ ${2:-} == --dry-run ]] && dry=true
if ! $dry; then
    [[ -c "$CAM" ]] || { echo "Not a character device: $CAM" >&2; exit 2; }
    command -v gst-launch-1.0 >/dev/null
    needed=(v4l2src fakesink)
    [[ "$mode" == capture ]] || needed+=(mpph264enc h264parse)
    case "$mode" in record) needed+=(mp4mux filesink);; segments|dual) needed+=(splitmuxsink);; esac
    case "$mode" in publish|dual) needed+=(rtspclientsink);; esac
    for p in "${needed[@]}"; do gst-inspect-1.0 "$p" >/dev/null || exit 3; done
fi
session="$OUT_DIR/DRY-RUN"
case "$mode" in
    record|segments|dual)
        if ! $dry; then
            mkdir -p -- "$OUT_DIR"
            session=$(mktemp -d "$OUT_DIR/session-$(date +%Y%m%d-%H%M%S)-XXXXXX")
            printf 'Output session: %s\n' "$session"
        fi ;;
esac
cmd=(gst-launch-1.0 -e -v v4l2src "device=$CAM" "io-mode=$IO_MODE")
case "$mode" in capture|record) cmd+=("num-buffers=$COUNT");; esac
cmd+=('!' "video/x-raw,format=NV12,width=$WIDTH,height=$HEIGHT,framerate=$FPS/1")
if [[ "$mode" == capture ]]; then
    cmd+=('!' fakesink sync=false)
else
    cmd+=('!' "$ENCODER" "${ENC_PROPS[@]}")
    case "$mode" in
        record) cmd+=('!' h264parse '!' mp4mux '!' filesink "location=$session/clip.mp4");;
        segments) cmd+=('!' h264parse '!' splitmuxsink "location=$session/part-%05d.mp4" "max-size-time=$SEGMENT_NS");;
        publish) cmd+=('!' h264parse '!' rtspclientsink protocols=tcp "location=$RTSP_URL");;
        dual)
            cmd+=('!' tee name=t
                t. '!' queue '!' h264parse '!' splitmuxsink
                "location=$session/part-%05d.mp4" "max-size-time=$SEGMENT_NS"
                t. '!' queue '!' h264parse '!' rtspclientsink protocols=tcp "location=$RTSP_URL") ;;
    esac
fi
printf 'Command: '; printf '%q ' "${cmd[@]}"; printf '\n'
if $dry; then exit 0; fi
exec "${cmd[@]}"
