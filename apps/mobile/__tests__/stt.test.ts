/**
 * On-device speech recognition adapter.
 *
 * These tests exist because the adapter was written blind against the native
 * module and shipped calling a method that does not exist
 * (`addSpeechRecognitionListener` instead of `addListener`). Nothing caught it
 * until an APK was installed on a real phone, because the module cannot load
 * in Expo Go or in Jest. A fake module pinned to the real API surface catches
 * that class of mistake on the next change.
 */

const mockListeners: Record<string, (payload: unknown) => void> = {};
const mockNative = {
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  addListener: jest.fn((event: string, handler: (payload: unknown) => void) => {
    mockListeners[event] = handler;
    return { remove: jest.fn() };
  }),
};

jest.mock('expo-speech-recognition', () => ({ ExpoSpeechRecognitionModule: mockNative }), {
  virtual: true,
});

import { SpeechError, isNativeRecognitionAvailable, recognizeOnDevice } from '@/services/speech/stt';

beforeEach(() => {
  for (const key of Object.keys(mockListeners)) delete mockListeners[key];
  jest.clearAllMocks();
  mockNative.requestPermissionsAsync.mockResolvedValue({ granted: true });
});

/** Let the adapter's permission promise resolve before we emit events. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('native module detection', () => {
  it('accepts a module that exposes the methods we actually call', () => {
    expect(isNativeRecognitionAvailable()).toBe(true);
  });
});

describe('recognizeOnDevice', () => {
  it('requests permission and starts recognition in German', async () => {
    const { promise } = recognizeOnDevice({ maxDurationMs: 5000 });
    await flush();

    expect(mockNative.requestPermissionsAsync).toHaveBeenCalled();
    expect(mockNative.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'de-DE', interimResults: false }),
    );

    mockListeners.result?.({
      isFinal: true,
      results: [{ transcript: 'Ich möchte einen Kaffee.', confidence: 0.9 }],
    });
    await expect(promise).resolves.toMatchObject({
      text: 'Ich möchte einen Kaffee.',
      engine: 'native',
      lowConfidence: false,
    });
  });

  it('subscribes with addListener, the method the native module actually has', async () => {
    recognizeOnDevice({ maxDurationMs: 5000 });
    await flush();
    const events = mockNative.addListener.mock.calls.map((c) => c[0]);
    expect(events).toContain('result');
    expect(events).toContain('error');
    expect(events).toContain('end');
  });

  it('ignores interim results and waits for the final one', async () => {
    const { promise } = recognizeOnDevice({ maxDurationMs: 5000 });
    await flush();

    mockListeners.result?.({ isFinal: false, results: [{ transcript: 'Ich', confidence: 0.4 }] });
    mockListeners.result?.({
      isFinal: true,
      results: [{ transcript: 'Ich wohne in Dhaka.', confidence: 0.88 }],
    });

    await expect(promise).resolves.toMatchObject({ text: 'Ich wohne in Dhaka.' });
  });

  it('treats confidence -1 as unknown, not as low confidence', async () => {
    // Android reports -1 when it has no confidence figure. Reading that as a
    // low score would ask the learner to repeat a perfectly good sentence.
    const { promise } = recognizeOnDevice({ maxDurationMs: 5000 });
    await flush();

    mockListeners.result?.({
      isFinal: true,
      results: [{ transcript: 'Guten Morgen!', confidence: -1 }],
    });

    const result = await promise;
    expect(result.confidence).toBeNull();
    expect(result.lowConfidence).toBe(false);
  });

  it('flags genuinely low confidence so the tutor asks for a repeat', async () => {
    const { promise } = recognizeOnDevice({ maxDurationMs: 5000 });
    await flush();
    mockListeners.result?.({ isFinal: true, results: [{ transcript: 'mmm hmm', confidence: 0.2 }] });
    await expect(promise).resolves.toMatchObject({ lowConfidence: true });
  });

  it('rejects with a German message when permission is denied', async () => {
    mockNative.requestPermissionsAsync.mockResolvedValue({ granted: false });
    const { promise } = recognizeOnDevice({ maxDurationMs: 5000 });

    await expect(promise).rejects.toMatchObject({
      code: 'permission-denied',
      userMessage: expect.stringContaining('Mikrofonzugriff'),
    });
    expect(mockNative.start).not.toHaveBeenCalled();
  });

  it('maps a not-allowed error to the permission message', async () => {
    const { promise } = recognizeOnDevice({ maxDurationMs: 5000 });
    await flush();
    mockListeners.error?.({ error: 'not-allowed', message: 'denied' });
    await expect(promise).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('does not leave the microphone stuck when recognition ends with no result', async () => {
    jest.useFakeTimers();
    const { promise } = recognizeOnDevice({ maxDurationMs: 5000 });
    const settled = promise.catch((error: SpeechError) => error);
    await Promise.resolve();

    mockListeners.end?.(null);
    jest.advanceTimersByTime(500);

    const error = await settled;
    expect((error as SpeechError).code).toBe('empty');
    jest.useRealTimers();
  });

  it('lets a final result arriving just after end still win', async () => {
    jest.useFakeTimers();
    const { promise } = recognizeOnDevice({ maxDurationMs: 5000 });
    await Promise.resolve();

    mockListeners.end?.(null);
    mockListeners.result?.({
      isFinal: true,
      results: [{ transcript: 'Danke schön!', confidence: 0.8 }],
    });
    jest.advanceTimersByTime(500);

    await expect(promise).resolves.toMatchObject({ text: 'Danke schön!' });
    jest.useRealTimers();
  });

  it('rejects an utterance too short to be German', async () => {
    const { promise } = recognizeOnDevice({ maxDurationMs: 5000 });
    await flush();
    mockListeners.result?.({ isFinal: true, results: [{ transcript: 'a', confidence: 0.9 }] });
    await expect(promise).rejects.toMatchObject({ code: 'empty' });
  });

  it('stops the recogniser when cancelled', async () => {
    const { cancel } = recognizeOnDevice({ maxDurationMs: 5000 });
    await flush();
    cancel();
    expect(mockNative.stop).toHaveBeenCalled();
  });
});
