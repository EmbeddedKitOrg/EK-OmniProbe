#!/usr/bin/env python3
import argparse
import json
import math
import select
import socket
import statistics
import sys
import time
import uuid

HOST = "127.0.0.1"


def connect(port):
    sock = socket.create_connection((HOST, port), timeout=3)
    stream = sock.makefile("rwb", buffering=0)
    hello = json.loads(stream.readline())
    if hello.get("schema") != "ek.telemetry/v1" or hello.get("type") != "hello":
        raise RuntimeError("服务端未返回 ek.telemetry/v1 握手")
    return sock, stream, hello


def read_messages(sock, stream, seconds):
    deadline = math.inf if seconds <= 0 else time.monotonic() + seconds
    while time.monotonic() < deadline:
        timeout = 0.5 if deadline == math.inf else min(0.5, max(0, deadline - time.monotonic()))
        if not select.select([sock], [], [], timeout)[0]:
            continue
        line = stream.readline()
        if not line:
            break
        yield json.loads(line)


def summarize(messages, duration):
    values = {}
    units = {}
    sample_rate = 0
    sample_count = 0
    for message in messages:
        if message.get("type") != "samples":
            continue
        sample_rate = message.get("sampleRateHz") or sample_rate
        units.update({item["key"]: item.get("unit") for item in message.get("channels", [])})
        for sample in message.get("samples", []):
            sample_count += 1
            for key, value in sample.get("values", {}).items():
                values.setdefault(key, []).append(value)

    channels = {}
    for key, series in values.items():
        channels[key] = {
            "unit": units.get(key),
            "count": len(series),
            "min": min(series),
            "max": max(series),
            "mean": statistics.fmean(series),
            "stddev": statistics.pstdev(series),
            "last": series[-1],
        }
    return {
        "durationSeconds": duration,
        "sampleCount": sample_count,
        "sampleRateHz": sample_rate,
        "channels": channels,
    }


def watch(args):
    sock, stream, hello = connect(args.port)
    sock.settimeout(None)
    print(json.dumps(hello, ensure_ascii=False), flush=True)
    try:
        for message in read_messages(sock, stream, args.seconds):
            print(json.dumps(message, ensure_ascii=False), flush=True)
    finally:
        stream.close()
        sock.close()


def snapshot(args):
    sock, stream, _ = connect(args.port)
    sock.settimeout(None)
    try:
        result = summarize(read_messages(sock, stream, args.seconds), args.seconds)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["sampleCount"] else 2
    finally:
        stream.close()
        sock.close()


def write(args):
    sock, stream, hello = connect(args.port)
    command_id = args.id or str(uuid.uuid4())
    command = {
        "type": "serial.write",
        "id": command_id,
        "text": args.text,
        "lineEnding": args.line_ending,
    }
    stream.write(json.dumps(command, ensure_ascii=False).encode() + b"\n")
    stream.flush()
    try:
        while True:
            response = json.loads(stream.readline())
            if response.get("type") == "ack" and response.get("id") == command_id:
                print(json.dumps(response, ensure_ascii=False, indent=2))
                return 0 if response.get("ok") else 1
    finally:
        stream.close()
        sock.close()


def self_test(_args):
    result = summarize(
        [{"type": "samples", "sampleRateHz": 10, "samples": [{"values": {"x": 1}}, {"values": {"x": 3}}]}],
        1,
    )
    assert result["sampleCount"] == 2
    assert result["channels"]["x"]["mean"] == 2
    print("ok")


def main():
    parser = argparse.ArgumentParser(description="EK-OmniProbe AI 数据桥接客户端")
    subparsers = parser.add_subparsers(dest="command", required=True)

    watch_parser = subparsers.add_parser("watch", help="持续输出 NDJSON 数据流")
    watch_parser.add_argument("--port", type=int, default=8765)
    watch_parser.add_argument("--seconds", type=float, default=0, help="0 表示持续运行")
    watch_parser.set_defaults(func=watch)

    snapshot_parser = subparsers.add_parser("snapshot", help="采集时间窗并输出统计摘要")
    snapshot_parser.add_argument("--port", type=int, default=8765)
    snapshot_parser.add_argument("--seconds", type=float, default=5)
    snapshot_parser.set_defaults(func=snapshot)

    write_parser = subparsers.add_parser("write", help="发送一条受控串口文本命令")
    write_parser.add_argument("--port", type=int, default=8765)
    write_parser.add_argument("--text", required=True)
    write_parser.add_argument("--line-ending", choices=("none", "lf", "crlf", "cr"), default="lf")
    write_parser.add_argument("--id")
    write_parser.set_defaults(func=write)

    test_parser = subparsers.add_parser("self-test", help="运行离线自检")
    test_parser.set_defaults(func=self_test)

    try:
        args = parser.parse_args()
        result = args.func(args)
        return result or 0
    except (ConnectionError, OSError, RuntimeError, json.JSONDecodeError) as error:
        print(f"错误: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
