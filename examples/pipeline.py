#!/usr/bin/env python3
"""GStreamer application lesson: frame counts, bus errors, EOS and cleanup.

Requires Python GI + GStreamer on Linux. Default uses a live test source.
This is a bounded teaching example, not a fault-tolerant recorder.
"""
import argparse
import json
import re
import signal
import sys
import threading
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', help='Verified ISP YUV node, e.g. /dev/video62')
    parser.add_argument('--width', type=int, default=640)
    parser.add_argument('--height', type=int, default=480)
    parser.add_argument('--fps', type=int, default=30)
    parser.add_argument('--seconds', type=int, default=10)
    args = parser.parse_args()
    if min(args.width, args.height, args.fps, args.seconds) <= 0:
        parser.error('All numeric arguments must be positive')
    if args.device and not re.fullmatch(r'/dev/video[0-9]+', args.device):
        parser.error('--device must be a verified /dev/videoN node')
    try:
        import gi
        gi.require_version('Gst', '1.0')
        from gi.repository import Gst, GLib
    except (ImportError, ValueError) as exc:
        print('Requires Python GI and GStreamer 1.0 on the Linux target:', exc, file=sys.stderr)
        return 2

    Gst.init(None)
    source = (f'v4l2src device={args.device} io-mode=mmap' if args.device
              else 'videotestsrc is-live=true')
    description = (source + f' ! video/x-raw,format=NV12,width={args.width},'
                   f'height={args.height},framerate={args.fps}/1'
                   ' ! identity name=meter silent=true ! fakesink sync=false')
    try:
        pipeline = Gst.parse_launch(description)
    except GLib.Error as exc:
        print('Pipeline creation failed:', exc, file=sys.stderr)
        return 2
    loop = GLib.MainLoop()
    lock = threading.Lock()
    state = {'frames': 0, 'valid_pts': 0, 'last_pts': None, 'pts_regressions': 0,
             'stopping': False, 'exit': 0, 'last_frame_at': None}
    start = time.monotonic()
    previous = [start, 0]

    def probe(pad, info):
        buf = info.get_buffer()
        if buf is not None:
            with lock:
                state['frames'] += 1
                state['last_frame_at'] = time.monotonic()
                if buf.pts != Gst.CLOCK_TIME_NONE:
                    state['valid_pts'] += 1
                    if state['last_pts'] is not None and buf.pts < state['last_pts']:
                        state['pts_regressions'] += 1
                    state['last_pts'] = buf.pts
        return Gst.PadProbeReturn.OK

    pad = pipeline.get_by_name('meter').get_static_pad('src')
    probe_id = pad.add_probe(Gst.PadProbeType.BUFFER, probe)

    def message(bus, msg):
        if msg.type == Gst.MessageType.ERROR:
            err, debug = msg.parse_error()
            print(json.dumps({'error': str(err), 'debug': debug}, ensure_ascii=False))
            state['exit'] = 1
            loop.quit()
        elif msg.type == Gst.MessageType.EOS:
            loop.quit()
        elif msg.type == Gst.MessageType.WARNING:
            err, debug = msg.parse_warning()
            print(json.dumps({'warning': str(err), 'debug': debug}, ensure_ascii=False))

    def force_stop():
        print('EOS did not complete within 5 seconds.', file=sys.stderr)
        state['exit'] = 1
        loop.quit()
        return False

    def stop():
        if not state['stopping']:
            state['stopping'] = True
            if not pipeline.send_event(Gst.Event.new_eos()):
                state['exit'] = 1
                loop.quit()
            else:
                GLib.timeout_add_seconds(5, force_stop)
        return False

    def report():
        now = time.monotonic()
        with lock:
            count = state['frames']
            pts = state['last_pts']
            age = None if state['last_frame_at'] is None else now - state['last_frame_at']
        print(json.dumps({'elapsed_s': round(now-start, 2), 'frames': count,
                          'measured_fps': round((count-previous[1])/(now-previous[0]), 2),
                          'last_pts_ns': pts, 'no_frame_for_s': age}), flush=True)
        previous[:] = [now, count]
        return not state['stopping']

    bus = pipeline.get_bus()
    bus.add_signal_watch()
    handler = bus.connect('message', message)
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: GLib.idle_add(stop))
    try:
        result = pipeline.set_state(Gst.State.PLAYING)
        if result == Gst.StateChangeReturn.FAILURE:
            print('PLAYING state failed', file=sys.stderr)
            state['exit'] = 1
        else:
            GLib.timeout_add_seconds(1, report)
            GLib.timeout_add_seconds(args.seconds, stop)
            loop.run()
    finally:
        pipeline.set_state(Gst.State.NULL)
        pad.remove_probe(probe_id)
        bus.disconnect(handler)
        bus.remove_signal_watch()
    if state['frames'] == 0:
        state['exit'] = 1
        print('No frames received.', file=sys.stderr)
    print(json.dumps({'final_frames': state['frames'], 'valid_pts': state['valid_pts'],
                      'pts_regressions': state['pts_regressions'],
                      'exit': state['exit']}, ensure_ascii=False))
    return state['exit']


if __name__ == '__main__':
    sys.exit(main())
