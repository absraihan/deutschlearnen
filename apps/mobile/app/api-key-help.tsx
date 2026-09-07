import React, { useState } from 'react';
import { Alert, Linking, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import { Button, Card, Divider, Row, Screen, SectionHeader, Text } from '@/components/ui';

/**
 * How to get an AI key, and somewhere to paste it.
 *
 * Telling a learner "add your own key in Settings" is only half an
 * instruction - it does not say where a key comes from. This screen is the
 * other half: the steps, a tappable link, and the input right here so the flow
 * is read, fetch, paste, done, without navigating back and forth while holding
 * a key on the clipboard.
 *
 * Bangla and English lines follow the learner's explanation-language settings,
 * the same rule the tutor uses, because this is operational help rather than
 * German practice - being understood matters more than being immersive.
 */

const KEY_URL = 'https://aistudio.google.com/apikey';

interface Step {
  de: string;
  bn: string;
  en: string;
}

const STEPS: Step[] = [
  {
    de: 'Öffne aistudio.google.com/apikey und melde dich mit deinem Google-Konto an.',
    bn: 'aistudio.google.com/apikey খুলুন এবং আপনার Google অ্যাকাউন্ট দিয়ে সাইন ইন করুন।',
    en: 'Open aistudio.google.com/apikey and sign in with your Google account.',
  },
  {
    de: 'Tippe auf „Create API key". Eine Kreditkarte ist nicht nötig.',
    bn: '"Create API key"-তে ট্যাপ করুন। ক্রেডিট কার্ড লাগবে না।',
    en: 'Tap "Create API key". No credit card is required.',
  },
  {
    de: 'Kopiere den Schlüssel. Er sieht ungefähr so aus: AIza… oder AQ.…',
    bn: 'key-টা কপি করুন। দেখতে এমন: AIza… বা AQ.…',
    en: 'Copy the key. It looks roughly like AIza… or AQ.…',
  },
  {
    de: 'Füge ihn unten ein und tippe auf „Speichern".',
    bn: 'নিচের ঘরে পেস্ট করে "Speichern"-এ ট্যাপ করুন।',
    en: 'Paste it in the field below and tap "Speichern".',
  },
];

export default function ApiKeyHelpScreen() {
  const theme = useTheme();
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  const [draft, setDraft] = useState(settings.userAiKey);
  const [saved, setSaved] = useState(false);

  const openKeyPage = async (): Promise<void> => {
    try {
      await Linking.openURL(KEY_URL);
    } catch {
      // No browser, or the link was blocked. The URL is on screen as text
      // anyway, so the learner can still type it.
      Alert.alert('Link konnte nicht geöffnet werden', KEY_URL);
    }
  };

  const save = async (): Promise<void> => {
    await update({ userAiKey: draft.trim() });
    setSaved(true);
  };

  return (
    <Screen scroll>
      <Text variant="display">KI-Schlüssel</Text>
      <Text variant="body" tone="muted" style={{ marginTop: 4 }}>
        Mit einem eigenen Schlüssel läuft dein Tutor über dein eigenes Konto – kostenlos.
      </Text>
      {settings.banglaExplanations ? (
        <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
          নিজের key দিলে টিউটর আপনার নিজের অ্যাকাউন্ট দিয়ে চলবে — বিনামূল্যে।
        </Text>
      ) : null}

      <Button
        label="Schlüssel-Seite öffnen"
        icon="🔗"
        size="lg"
        style={{ marginTop: theme.spacing.xl }}
        onPress={() => void openKeyPage()}
        accessibilityHint="Öffnet Google AI Studio im Browser"
      />
      <Text variant="mono" tone="subtle" style={{ marginTop: theme.spacing.sm, textAlign: 'center' }}>
        {KEY_URL}
      </Text>

      <SectionHeader title="Schritt für Schritt" />
      <Card>
        {STEPS.map((step, index) => (
          <View key={step.de}>
            <Row gap={10} style={{ alignItems: 'flex-start' }}>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: theme.colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="label" tone="primary">
                  {index + 1}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="body">{step.de}</Text>
                {settings.banglaExplanations ? (
                  <Text variant="caption" tone="muted">
                    {step.bn}
                  </Text>
                ) : null}
                {settings.englishExplanations ? (
                  <Text variant="caption" tone="subtle">
                    {step.en}
                  </Text>
                ) : null}
              </View>
            </Row>
            {index < STEPS.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </Card>

      <SectionHeader title="Schlüssel eintragen" />
      <Card>
        <TextInput
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            setSaved(false);
          }}
          placeholder="Schlüssel hier einfügen"
          placeholderTextColor={theme.colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="KI-Schlüssel eingeben"
          style={{
            height: 48,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: saved ? theme.colors.success : theme.colors.border,
            backgroundColor: theme.colors.background,
            color: theme.colors.text,
            paddingHorizontal: theme.spacing.md,
            fontSize: 15,
          }}
        />
        <Button
          label={saved ? '✓ Gespeichert' : 'Speichern'}
          variant={saved ? 'secondary' : 'primary'}
          disabled={!draft.trim() && !settings.userAiKey}
          style={{ marginTop: theme.spacing.md }}
          onPress={() => void save()}
        />
        <Text variant="caption" tone="subtle" style={{ marginTop: theme.spacing.sm }}>
          Der Schlüssel bleibt auf diesem Gerät. Er wird nur mit deinen eigenen Anfragen
          mitgeschickt und nirgendwo gespeichert.
        </Text>
        {settings.banglaExplanations ? (
          <Text variant="caption" tone="subtle" style={{ marginTop: 4 }}>
            key-টা শুধু এই ফোনেই থাকে, শুধু আপনার নিজের অনুরোধের সাথে যায়, কোথাও সেভ হয় না।
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Häufige Fragen" />
      <Card>
        <Text variant="bodyStrong">Kostet das etwas?</Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
          Nein. Google AI Studio hat ein kostenloses Kontingent und verlangt keine
          Kreditkarte. Bei sehr viel Nutzung kann es kurz pausieren – dann sagt der Tutor
          Bescheid und du versuchst es gleich noch einmal.
        </Text>

        <Divider />

        <Text variant="bodyStrong">Was, wenn ich keinen Schlüssel eintrage?</Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
          Dann antwortet der Server mit seinem eigenen Schlüssel, falls er dafür
          eingerichtet ist. Ist er das nicht, brauchst du einen eigenen.
        </Text>

        <Divider />

        <Text variant="bodyStrong">Kann ich den Schlüssel wieder entfernen?</Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
          Ja – Feld leeren und speichern. Du kannst ihn auch jederzeit in Google AI Studio
          löschen und einen neuen erstellen.
        </Text>
      </Card>

      <Button
        label="Fertig"
        variant="ghost"
        style={{ marginTop: theme.spacing.xl }}
        onPress={() => router.back()}
      />
      <View style={{ height: theme.spacing.xl }} />
    </Screen>
  );
}
