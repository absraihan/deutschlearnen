import React from 'react';
import { render } from '@testing-library/react-native';
import type { Correction } from '@deutschcoach/shared';
import { CorrectionCard, MicButton, MessageBubble } from '@/components/conversation';
import { ThemeProvider } from '@/theme';

/**
 * `render` is asynchronous in @testing-library/react-native v14, and queries
 * come from the object it resolves to rather than the global `screen` (the
 * workspace can hoist a second copy of the library, so the global is not
 * guaranteed to be the instance our call populated).
 */
function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider preference="dark">{node}</ThemeProvider>);
}

const correction: Correction = {
  hasError: true,
  original: 'Gestern ich habe zum Markt gegangen.',
  corrected: 'Gestern bin ich zum Markt gegangen.',
  explanation: 'Bei "gehen" benutzen wir im Perfekt "sein".',
  explanationBn: '"gehen" এর Perfekt-এ "sein" বসে।',
  explanationEn: 'Verbs of motion use "sein" in the Perfekt.',
  category: 'auxiliary-verb',
  severity: 'important',
  naturalAlternative: 'Gestern war ich auf dem Markt.',
};

describe('CorrectionCard', () => {
  it('shows the corrected sentence and the German explanation', async () => {
    const { getByText } = await renderWithTheme(<CorrectionCard correction={correction} />);
    expect(getByText(/Gestern bin ich zum Markt gegangen/)).toBeTruthy();
    expect(getByText('Bei "gehen" benutzen wir im Perfekt "sein".')).toBeTruthy();
  });

  it('labels the grammar category in German', async () => {
    const { getByText } = await renderWithTheme(<CorrectionCard correction={correction} />);
    expect(getByText('Hilfsverb (sein/haben)')).toBeTruthy();
  });

  it('hides Bangla and English when the learner turned them off', async () => {
    const { queryByText } = await renderWithTheme(
      <CorrectionCard correction={correction} showBangla={false} showEnglish={false} />,
    );
    expect(queryByText(/Perfekt-এ/)).toBeNull();
    expect(queryByText(/Verbs of motion/)).toBeNull();
  });

  it('renders Bangla when enabled, since the learner is a Bangla speaker', async () => {
    const { getByText } = await renderWithTheme(
      <CorrectionCard correction={correction} showBangla showEnglish />,
    );
    expect(getByText(/Perfekt-এ/)).toBeTruthy();
    expect(getByText(/Verbs of motion/)).toBeTruthy();
  });

  it('flags a mistake the learner has made before', async () => {
    const { getByText } = await renderWithTheme(
      <CorrectionCard correction={correction} isRepeat />,
    );
    expect(getByText(/schon wieder/)).toBeTruthy();
  });

  it('renders nothing when there is no error, rather than an empty card', async () => {
    const clean: Correction = { ...correction, hasError: false, corrected: '' };
    const { toJSON } = await renderWithTheme(<CorrectionCard correction={clean} />);
    expect(toJSON()).toBeNull();
  });

  it('preserves umlauts and eszett exactly', async () => {
    const umlaut: Correction = {
      ...correction,
      corrected: 'Ich möchte einen großen Kaffee für die Prüfung.',
      explanation: 'Nach "möchten" steht der Akkusativ.',
    };
    const { getByText } = await renderWithTheme(<CorrectionCard correction={umlaut} />);
    expect(getByText(/Ich möchte einen großen Kaffee für die Prüfung\./)).toBeTruthy();
  });

  it('shows the natural alternative when the correction carries one', async () => {
    const { getByText } = await renderWithTheme(<CorrectionCard correction={correction} />);
    expect(getByText(/Gestern war ich auf dem Markt/)).toBeTruthy();
  });
});

describe('MicButton', () => {
  it('tells the learner it is listening', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(
      <MicButton state="listening" onPress={() => {}} />,
    );
    expect(getByText('Ich höre zu')).toBeTruthy();
    expect(getByLabelText('Aufnahme beenden')).toBeTruthy();
  });

  it('gives every state its own label, so the learner always knows what is happening', async () => {
    const labels = new Set<string>();
    for (const state of ['idle', 'listening', 'processing', 'speaking', 'error'] as const) {
      const view = await renderWithTheme(<MicButton state={state} onPress={() => {}} />);
      const button = view.getByRole('button');
      labels.add(String(button.props.accessibilityLabel));
      await view.unmount();
    }
    expect(labels.size).toBe(5);
  });

  it('shows the elapsed recording time while listening', async () => {
    const { getByText } = await renderWithTheme(
      <MicButton state="listening" onPress={() => {}} recordingMs={3400} />,
    );
    expect(getByText(/3\.4s/)).toBeTruthy();
  });

  it('reports itself as disabled while the tutor is thinking', async () => {
    const { getByLabelText } = await renderWithTheme(
      <MicButton state="processing" onPress={() => {}} disabled />,
    );
    expect(getByLabelText('Der Tutor denkt nach').props.accessibilityState.disabled).toBe(true);
  });
});

describe('MessageBubble', () => {
  it('warns when speech recognition was unsure', async () => {
    const { getByText } = await renderWithTheme(
      <MessageBubble speaker="user" text="Ich mokte ein kafi" confidence={0.4} />,
    );
    expect(getByText(/Erkennung unsicher \(40%\)/)).toBeTruthy();
  });

  it('does not warn when recognition was confident', async () => {
    const { queryByText } = await renderWithTheme(
      <MessageBubble speaker="user" text="Ich möchte einen Kaffee" confidence={0.95} />,
    );
    expect(queryByText(/Erkennung unsicher/)).toBeNull();
  });

  it('offers replay only for tutor messages', async () => {
    const { getByText } = await renderWithTheme(
      <MessageBubble speaker="ai" text="Wie geht es dir?" onReplay={() => {}} />,
    );
    expect(getByText('Tippen zum Wiederholen')).toBeTruthy();
  });

  it('does not offer replay for the learner own words', async () => {
    const { queryByText } = await renderWithTheme(<MessageBubble speaker="user" text="Hallo!" />);
    expect(queryByText('Tippen zum Wiederholen')).toBeNull();
  });
});
