#!/usr/bin/env bash
# Read-only hardware/software discovery. Logs are written locally.
set -u
umask 077
out=$(mktemp -d "./rk3588-probe-$(date +%Y%m%d-%H%M%S)-XXXXXX") || exit 1
run() {
    local name=$1
    shift
    { printf 'COMMAND:'; printf ' %q' "$@"; printf '\n'; "$@"; } > "$out/$name.txt" 2>&1
    local rc=$?
    printf '%s: exit %s\n' "$name" "$rc" >> "$out/status.txt"
}
run kernel uname -a
run os cat /etc/os-release
run cmdline cat /proc/cmdline
if [ -r /proc/device-tree/model ]; then
    tr -d '\0' < /proc/device-tree/model > "$out/model.txt"
fi
run video-devices v4l2-ctl --list-devices
run gst-version gst-launch-1.0 --version
run ffmpeg-version ffmpeg -version
run ffmpeg-encoders ffmpeg -hide_banner -encoders
run audio-devices arecord -l
run memory cat /proc/meminfo
run disk df -h
run kernel-log dmesg
for m in /dev/media*; do
    [ -e "$m" ] || continue
    run "$(basename "$m")" media-ctl -d "$m" -p
done
for node in /sys/class/video4linux/video*/name; do
    [ -f "$node" ] || continue
    printf '%s: ' "$node" >> "$out/video-names.txt"
    cat "$node" >> "$out/video-names.txt"
done
for plugin in v4l2src videotestsrc x264enc mpph264enc mppvideodec \
              h264parse mp4mux splitmuxsink rtspclientsink alsasrc avenc_aac; do
    run "plugin-$plugin" gst-inspect-1.0 "$plugin"
done
printf 'Saved local report: %s\nMissing tools and permission failures are recorded in status.txt.\n' "$out"
