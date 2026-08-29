import { useCallback, useEffect, useRef, useState } from "react";

export type KeyboardWedgeOptions = {
  maxIntervalMs?: number;
  minLength?: number;
};

export type ScannedKey = {
  key: string;
  timestamp: number;
};

export function detectKeyboardWedgeBarcode(
  events: ScannedKey[],
  maxIntervalMs = 50,
  minLength = 3,
): string | null {
  if (events.length === 0) return null;

  let buffer = "";
  let lastTimestamp = 0;

  for (const event of events) {
    const key = event.key;
    const now = event.timestamp;

    if (key === "Enter") {
      if (buffer.length >= minLength && now - lastTimestamp <= maxIntervalMs) {
        return buffer;
      }
      buffer = "";
      lastTimestamp = now;
      continue;
    }

    if (key.length !== 1 || key === " " || key === "\n" || key === "\r") {
      buffer = "";
      lastTimestamp = now;
      continue;
    }

    if (lastTimestamp && now - lastTimestamp > maxIntervalMs) {
      buffer = "";
    }

    buffer += key;
    lastTimestamp = now;
  }

  return null;
}

export function useKeyboardWedgeScan(
  onScan: (barcode: string) => void,
  options: KeyboardWedgeOptions = {},
) {
  const { maxIntervalMs = 50, minLength = 3 } = options;
  const frameRef = useRef<ScannedKey[]>([]);
  const lastTimestampRef = useRef<number>(0);

  const flush = useCallback(() => {
    const barcode = detectKeyboardWedgeBarcode(
      frameRef.current,
      maxIntervalMs,
      minLength,
    );
    if (barcode) {
      onScan(barcode);
    }
    frameRef.current = [];
    lastTimestampRef.current = 0;
  }, [maxIntervalMs, minLength, onScan]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Enter") {
        flush();
        return;
      }

      if (event.key.length !== 1 || event.key === " ") {
        return;
      }

      const now = Date.now();
      if (
        lastTimestampRef.current &&
        now - lastTimestampRef.current > maxIntervalMs
      ) {
        frameRef.current = [];
      }

      frameRef.current.push({ key: event.key, timestamp: now });
      lastTimestampRef.current = now;
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flush, maxIntervalMs]);
}

export type CameraScanState = {
  support: "native" | "fallback" | "unsupported";
  active: boolean;
  supported: boolean;
  error: string | null;
};

export function useCameraScan(onScan: (barcode: string) => void) {
  const [state, setState] = useState<CameraScanState>({
    support: "unsupported",
    active: false,
    supported: false,
    error: null,
  });
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  const stop = useCallback(async () => {
    if (readerRef.current) {
      await readerRef.current.stop();
      readerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setState((current) => ({ ...current, active: false }));
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({
        support: "unsupported",
        active: false,
        supported: false,
        error: "Camera scanning is not supported in this browser.",
      });
      return;
    }

    setState((current) => ({ ...current, error: null, active: true }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;

      if ("BarcodeDetector" in window) {
        const detector = new (
          window as typeof window & {
            BarcodeDetector: new (options?: { formats?: string[] }) => {
              detect: (
                source: ImageBitmapSource | HTMLVideoElement,
              ) => Promise<Array<{ rawValue?: string }>>;
            };
          }
        ).BarcodeDetector({
          formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code"],
        });

        setState({
          support: "native",
          active: true,
          supported: true,
          error: null,
        });

        const video = document.createElement("video");
        video.srcObject = stream;
        video.playsInline = true;
        video.autoplay = true;
        await video.play();

        const tick = async () => {
          if (!streamRef.current) return;
          try {
            const results = await detector.detect(video);
            const barcode = results[0]?.rawValue;
            if (barcode) {
              onScan(barcode);
              await stop();
              return;
            }
          } catch {
            // ignore transient detection failures and keep trying until stopped
          }
          if (streamRef.current) {
            requestAnimationFrame(() => {
              void tick();
            });
          }
        };

        void tick();
        return;
      }

      const zxingModule = await import("@zxing/browser");
      const { BrowserMultiFormatReader } = zxingModule as {
        BrowserMultiFormatReader: new () => {
          decodeOnceFromVideoDevice?: (
            deviceId?: string,
            videoElement?: HTMLVideoElement,
            callback?: (value: unknown) => void,
          ) => Promise<unknown>;
          reset?: () => Promise<void>;
        };
      };
      const reader: any = new BrowserMultiFormatReader();
      readerRef.current = {
        stop: async () => {
          if (typeof reader.reset === "function") {
            await reader.reset();
          }
        },
      };

      const video = document.createElement("video");
      video.srcObject = stream;
      video.playsInline = true;
      video.autoplay = true;
      await video.play();

      setState({
        support: "fallback",
        active: true,
        supported: true,
        error: null,
      });

      const result = await reader.decodeOnceFromVideoDevice(
        undefined,
        video,
        (value: unknown) => {
          if (value) {
            onScan(String(value));
            void stop();
          }
        },
      );

      if (result && typeof result === "object" && "getText" in result) {
        const text = (result as { getText: () => string }).getText();
        onScan(String(text));
        await stop();
      }
    } catch (error) {
      await stop();
      setState({
        support: "unsupported",
        active: false,
        supported: false,
        error:
          error instanceof Error
            ? error.message
            : "Camera permission was denied or the camera is unavailable.",
      });
    }
  }, [onScan, stop]);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return {
    ...state,
    start,
    stop,
  };
}
