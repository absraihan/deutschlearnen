import fs from 'node:fs';
import path from 'node:path';

/**
 * Every microphone must honour the learner's speech-engine setting.
 *
 * The listening and shadowing screens called server transcription directly
 * while only the conversation screen checked the setting. With
 * `STT_PROVIDER=none` - the default, and what a keyless deployment runs -
 * their microphone could never work, and the learner saw a connection error on
 * a perfectly good connection.
 *
 * This is a source check rather than a render test on purpose: the bug was a
 * screen reaching past the shared abstraction, which is visible in the imports
 * and invisible in any single screen's behaviour.
 */

const APP_DIR = path.join(__dirname, '..', 'app');

function readScreen(file: string): string {
  return fs.readFileSync(path.join(APP_DIR, file), 'utf8');
}

/** Screens with a microphone that are not the conversation screen itself. */
const MIC_SCREENS = ['listening.tsx', 'shadowing.tsx'];

describe('speech engine selection', () => {
  it.each(MIC_SCREENS)('%s captures through the shared hook', (file) => {
    expect(readScreen(file)).toContain('useSpeechCapture');
  });

  it.each(MIC_SCREENS)('%s does not call server transcription directly', (file) => {
    // transcribeRecording is the cloud-only path. Screens must go through the
    // hook, which picks cloud or on-device from the learner's setting.
    expect(readScreen(file)).not.toContain('transcribeRecording');
  });

  it.each(MIC_SCREENS)('%s does not drive the recorder itself', (file) => {
    expect(readScreen(file)).not.toContain('useRecorder');
  });

  it('the shared hook actually branches on the setting', () => {
    const hook = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'hooks', 'useSpeechCapture.ts'),
      'utf8',
    );
    expect(hook).toContain('speechEngine');
    expect(hook).toContain('recognizeOnDevice');
    expect(hook).toContain('transcribeRecording');
  });

  it('the conversation screen still honours the setting', () => {
    const conversation = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'features', 'conversation', 'useConversation.ts'),
      'utf8',
    );
    expect(conversation).toContain('speechEngine');
  });
});

/**
 * The key-help route.
 *
 * "Add your own key in Settings" is only half an instruction without saying
 * where a key comes from. These pin that the guidance exists, is reachable
 * from both the settings screen and the error a learner actually hits, and
 * carries a real link rather than prose describing one.
 */
describe('AI key help', () => {
  const help = fs.readFileSync(path.join(APP_DIR, 'api-key-help.tsx'), 'utf8');

  it('links to the page where a key is actually created', () => {
    expect(help).toContain('https://aistudio.google.com/apikey');
    expect(help).toContain('Linking.openURL');
  });

  it('lets the learner paste the key without navigating away', () => {
    expect(help).toContain('TextInput');
    expect(help).toContain('userAiKey');
  });

  it('explains the cost and where the key is stored', () => {
    expect(help).toMatch(/Kreditkarte/);
    expect(help).toMatch(/auf diesem Gerät/);
  });

  it('offers Bangla for a Bangla-speaking learner', () => {
    expect(help).toContain('banglaExplanations');
    expect(help).toMatch(/[ঀ-৿]/); // Bangla script is actually present
  });

  it('is reachable from settings', () => {
    expect(readScreen('(tabs)/settings.tsx')).toContain('/api-key-help');
  });

  it('is offered on the error that a missing key produces', () => {
    const conversation = readScreen('conversation.tsx');
    expect(conversation).toContain('user_key_required');
    expect(conversation).toContain('/api-key-help');
  });
});
