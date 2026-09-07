import React, { useState } from 'react';
import { Alert, Switch, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  CEFR_LEVELS,
  CORRECTION_MODES,
  SESSION_DURATIONS,
  type CefrLevel,
  type CorrectionMode,
} from '@deutschlearnen/shared';
import {
  deleteAllData,
  deleteConversationHistory,
  deleteMistakes,
  deleteVocabulary,
  getSchemaVersion,
  LATEST_VERSION,
} from '@/database';
import { api } from '@/services/api';
import { isNativeRecognitionAvailable } from '@/services/speech/stt';
import { listGermanVoices, speak } from '@/services/speech/tts';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import {
  Button,
  Card,
  Chip,
  Divider,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';

const CORRECTION_LABELS: Record<CorrectionMode, { title: string; body: string }> = {
  OFF: { title: 'Aus', body: 'Nur Gespräch, keine Korrekturen.' },
  MINIMAL: { title: 'Minimal', body: 'Nur der korrigierte Satz.' },
  NORMAL: { title: 'Normal', body: 'Korrektur und kurze Erklärung.' },
  DETAILED: { title: 'Ausführlich', body: 'Korrektur, Grammatik und Alternativen.' },
};

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const [busy, setBusy] = useState(false);

  const health = useQuery({
    queryKey: ['server-health'],
    queryFn: () => api.health(),
    retry: false,
    staleTime: 15_000,
  });

  const voices = useQuery({ queryKey: ['german-voices'], queryFn: listGermanVoices });
  const schemaVersion = useQuery({ queryKey: ['schema-version'], queryFn: getSchemaVersion });

  const nativeAvailable = isNativeRecognitionAvailable();

  const confirmDelete = (
    title: string,
    message: string,
    action: () => Promise<void>,
  ): void => {
    Alert.alert(title, message, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await action();
            Alert.alert('Erledigt', 'Die Daten wurden gelöscht.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen scroll>
      <Text variant="display">Einstellungen</Text>

      <SectionHeader title="Dein Niveau" />
      <Card>
        <Text variant="label" tone="muted">
          Aktuelles Niveau
        </Text>
        <Row style={{ flexWrap: 'wrap', marginTop: theme.spacing.sm }} gap={8}>
          {CEFR_LEVELS.map((level) => (
            <Chip
              key={level}
              label={level}
              selected={settings.currentLevel === level}
              onPress={() => void update({ currentLevel: level as CefrLevel })}
            />
          ))}
        </Row>

        <Divider />

        <Text variant="label" tone="muted">
          Zielniveau
        </Text>
        <Row style={{ flexWrap: 'wrap', marginTop: theme.spacing.sm }} gap={8}>
          {CEFR_LEVELS.map((level) => (
            <Chip
              key={level}
              label={level}
              selected={settings.targetLevel === level}
              onPress={() => void update({ targetLevel: level as CefrLevel })}
            />
          ))}
        </Row>

        <Divider />

        <ToggleRow
          label="Automatische Anpassung"
          hint="Das Niveau steigt oder sinkt anhand deiner Leistung – nie mehr als eine Stufe."
          value={settings.adaptiveDifficulty}
          onChange={(value) => void update({ adaptiveDifficulty: value })}
        />
      </Card>

      <SectionHeader title="Korrekturen" />
      <Card>
        {CORRECTION_MODES.map((mode) => (
          <View key={mode}>
            <Row
              style={{ alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}
            >
              <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
                <Text variant="bodyStrong">{CORRECTION_LABELS[mode].title}</Text>
                <Text variant="caption" tone="muted">
                  {CORRECTION_LABELS[mode].body}
                </Text>
              </View>
              <Chip
                label={settings.correctionMode === mode ? 'Aktiv' : 'Wählen'}
                selected={settings.correctionMode === mode}
                onPress={() => void update({ correctionMode: mode })}
              />
            </Row>
            {mode !== 'DETAILED' ? <Divider /> : null}
          </View>
        ))}
      </Card>

      <SectionHeader title="Erklärsprachen" />
      <Card>
        <Text variant="caption" tone="muted" style={{ marginBottom: theme.spacing.sm }}>
          Das Gespräch ist immer auf Deutsch. Diese Sprachen kommen nur bei Erklärungen dazu.
        </Text>
        <ToggleRow
          label="Bangla-Erklärungen"
          hint="বাংলায় ব্যাখ্যা"
          value={settings.banglaExplanations}
          onChange={(value) => void update({ banglaExplanations: value })}
        />
        <Divider />
        <ToggleRow
          label="Englische Erklärungen"
          value={settings.englishExplanations}
          onChange={(value) => void update({ englishExplanations: value })}
        />
      </Card>

      <SectionHeader title="Sprache und Stimme" />
      <Card>
        <Text variant="label" tone="muted">
          Sprechgeschwindigkeit des Tutors
        </Text>
        <Row style={{ flexWrap: 'wrap', marginTop: theme.spacing.sm }} gap={8}>
          {[0.7, 0.8, 0.9, 1.0, 1.1].map((speed) => (
            <Chip
              key={speed}
              label={`${speed.toFixed(1)}x`}
              selected={Math.abs(settings.voiceSpeed - speed) < 0.01}
              onPress={() => void update({ voiceSpeed: speed })}
            />
          ))}
        </Row>

        <Button
          label="Stimme testen"
          variant="secondary"
          size="sm"
          style={{ marginTop: theme.spacing.md }}
          onPress={() =>
            void speak({
              text: 'Guten Tag! Ich bin dein Deutschlehrer. Lass uns zusammen üben.',
              level: settings.currentLevel,
              speedPreference: settings.voiceSpeed,
              engine: settings.ttsEngine,
              voice: settings.aiVoice,
            })
          }
        />

        {voices.data && voices.data.length > 0 ? (
          <>
            <Divider />
            <Text variant="label" tone="muted">
              Deutsche Stimme ({voices.data.length} verfügbar)
            </Text>
            <Row style={{ flexWrap: 'wrap', marginTop: theme.spacing.sm }} gap={8}>
              <Chip
                label="Standard"
                selected={!settings.aiVoice}
                onPress={() => void update({ aiVoice: '' })}
              />
              {voices.data.slice(0, 6).map((voice) => (
                <Chip
                  key={voice.id}
                  label={voice.name.slice(0, 18)}
                  selected={settings.aiVoice === voice.id}
                  onPress={() => void update({ aiVoice: voice.id })}
                />
              ))}
            </Row>
          </>
        ) : null}

        <Divider />
        <Text variant="label" tone="muted">
          Sprachausgabe
        </Text>
        <Row style={{ marginTop: theme.spacing.sm }} gap={8}>
          <Chip
            label="Gerät (kostenlos)"
            selected={settings.ttsEngine === 'device'}
            onPress={() => void update({ ttsEngine: 'device' })}
          />
          <Chip
            label="Server"
            selected={settings.ttsEngine === 'server'}
            onPress={() => void update({ ttsEngine: 'server' })}
          />
        </Row>
        {settings.ttsEngine === 'server' && health.data?.tts.provider === 'none' ? (
          <Text variant="caption" tone="warning" style={{ marginTop: theme.spacing.sm }}>
            Auf dem Server ist keine Sprachausgabe eingerichtet (TTS_PROVIDER=none). Die App
            nutzt automatisch die Stimme des Geräts.
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Spracherkennung" />
      <Card>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Chip
            label="Server (genauer)"
            selected={settings.speechEngine === 'cloud'}
            onPress={() => void update({ speechEngine: 'cloud' })}
          />
          <Chip
            label={nativeAvailable ? 'Gerät (kostenlos)' : 'Gerät – nicht verfügbar'}
            selected={settings.speechEngine === 'native'}
            onPress={
              nativeAvailable
                ? () => void update({ speechEngine: 'native' })
                : () =>
                    Alert.alert(
                      'Nicht verfügbar',
                      'Die Erkennung auf dem Gerät braucht ein Development Build mit expo-speech-recognition. In Expo Go ist sie nicht enthalten. Details stehen in SETUP.md.',
                    )
            }
          />
        </Row>
        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          Erkennungssprache ist immer Deutsch (de-DE). Bei unsicherer Erkennung fragt der Tutor
          nach, statt zu raten.
        </Text>
        {settings.speechEngine === 'cloud' && health.data?.stt.provider === 'none' ? (
          <Text variant="caption" tone="warning" style={{ marginTop: theme.spacing.sm }}>
            Auf dem Server ist keine Spracherkennung eingerichtet (STT_PROVIDER=none). Nutze
            solange den Text-Chat.
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Tagesziel" />
      <Card>
        <Row style={{ flexWrap: 'wrap' }} gap={8}>
          {SESSION_DURATIONS.map((minutes) => (
            <Chip
              key={minutes}
              label={`${minutes} min`}
              selected={settings.dailyGoalMinutes === minutes}
              onPress={() => void update({ dailyGoalMinutes: minutes })}
            />
          ))}
        </Row>
      </Card>

      <SectionHeader title="Aufnahmen und Verlauf" />
      <Card>
        <ToggleRow
          label="Gespräche speichern"
          hint="Verlauf, Auswertungen und Fehlerliste auf diesem Gerät."
          value={settings.saveConversations}
          onChange={(value) => void update({ saveConversations: value })}
        />
        <Divider />
        <ToggleRow
          label="Sprachaufnahmen behalten"
          hint="Aus. Aufnahmen werden nach der Erkennung normalerweise verworfen."
          value={settings.saveAudioRecordings}
          onChange={(value) => void update({ saveAudioRecordings: value })}
        />
        <Divider />
        <ToggleRow
          label="Vibration"
          value={settings.hapticsEnabled}
          onChange={(value) => void update({ hapticsEnabled: value })}
        />
      </Card>

      <SectionHeader title="Darstellung" />
      <Card>
        <Row gap={8}>
          {(['system', 'light', 'dark'] as const).map((mode) => (
            <Chip
              key={mode}
              label={{ system: 'System', light: 'Hell', dark: 'Dunkel' }[mode]}
              selected={settings.theme === mode}
              onPress={() => void update({ theme: mode })}
            />
          ))}
        </Row>
      </Card>

      <SectionHeader title="Server" />
      <Card>
        <Text variant="caption" tone="muted">
          Adresse
        </Text>
        <Text variant="mono" style={{ marginTop: 2 }}>
          {api.baseUrl}
        </Text>
        <Divider />
        {health.isLoading ? (
          <Text variant="caption" tone="muted">
            Verbindung wird geprüft...
          </Text>
        ) : health.data ? (
          <>
            <Text variant="caption" tone="success">
              Verbunden · KI: {health.data.ai.provider} ({health.data.ai.model})
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
              Spracherkennung: {health.data.stt.provider} · Sprachausgabe: {health.data.tts.provider}
            </Text>
          </>
        ) : (
          <Text variant="caption" tone="danger">
            Nicht erreichbar. Prüfe EXPO_PUBLIC_API_URL in apps/mobile/.env und ob der Server läuft.
          </Text>
        )}
        <Button
          label="Verbindung erneut prüfen"
          variant="ghost"
          size="sm"
          style={{ marginTop: theme.spacing.md }}
          onPress={() => void health.refetch()}
        />
      </Card>

      <SectionHeader title="Eigener KI-Schlüssel" />
      <Card>
        <Text variant="caption" tone="muted">
          Optional. Mit einem eigenen Schlüssel laufen deine Gespräche über dein
          eigenes Google-AI-Studio-Konto. Der Schlüssel bleibt auf diesem Gerät und
          wird nur für deine eigenen Anfragen mitgeschickt – nie gespeichert.
        </Text>
        <TextInput
          value={settings.userAiKey}
          onChangeText={(value) => void update({ userAiKey: value.trim() })}
          placeholder="AI... (leer lassen für den Server-Schlüssel)"
          placeholderTextColor={theme.colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          accessibilityLabel="Eigener KI-Schlüssel"
          style={{
            marginTop: theme.spacing.md,
            height: 48,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            color: theme.colors.text,
            paddingHorizontal: theme.spacing.md,
            fontSize: 15,
          }}
        />
        <Row style={{ marginTop: theme.spacing.sm, alignItems: 'center' }} gap={8}>
          <Text variant="caption" tone={settings.userAiKey ? 'success' : 'subtle'}>
            {settings.userAiKey
              ? `Eigener Schlüssel aktiv (${settings.userAiKey.length} Zeichen)`
              : 'Kein eigener Schlüssel – der Server antwortet, falls er darf.'}
          </Text>
        </Row>
        {settings.userAiKey ? (
          <Button
            label="Schlüssel entfernen"
            variant="ghost"
            size="sm"
            style={{ marginTop: theme.spacing.sm }}
            onPress={() => void update({ userAiKey: '' })}
          />
        ) : null}
        <Button
          label="Anleitung: Schlüssel holen"
          icon="📖"
          variant="secondary"
          size="sm"
          style={{ marginTop: theme.spacing.md }}
          onPress={() => router.push('/api-key-help')}
        />
      </Card>

      <SectionHeader title="Datenschutz" />
      <Card>
        <Text variant="caption" tone="muted">
          Alle deine Daten liegen nur auf diesem Gerät. Der Server speichert nichts – er leitet
          nur einzelne Anfragen an das KI-Modell weiter.
        </Text>
        <Divider />
        <Button
          label="Gesprächsverlauf löschen"
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={() =>
            confirmDelete(
              'Gesprächsverlauf löschen?',
              'Wörter, Fehler und Fortschritt bleiben erhalten.',
              deleteConversationHistory,
            )
          }
        />
        <Button
          label="Wörter löschen"
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={() =>
            confirmDelete('Wörter löschen?', 'Deine gesammelten Vokabeln werden entfernt.', deleteVocabulary)
          }
        />
        <Button
          label="Fehlerliste löschen"
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={() =>
            confirmDelete(
              'Fehlerliste löschen?',
              'Der Tutor erinnert sich dann nicht mehr an deine bisherigen Fehler.',
              deleteMistakes,
            )
          }
        />
        <Button
          label="Alle Daten löschen"
          variant="danger"
          disabled={busy}
          style={{ marginTop: theme.spacing.sm }}
          onPress={() =>
            confirmDelete(
              'Wirklich alle Daten löschen?',
              'Gespräche, Wörter, Fehler, Fortschritt und Einstellungen werden unwiderruflich entfernt.',
              deleteAllData,
            )
          }
        />
      </Card>

      <View style={{ marginTop: theme.spacing.xl, alignItems: 'center', gap: 4 }}>
        <Text variant="caption" tone="subtle">
          {settings.appName} · Version 0.1.0
        </Text>
        <Text variant="caption" tone="subtle">
          Datenbank v{schemaVersion.data ?? '?'} von {LATEST_VERSION}
        </Text>
      </View>
      <View style={{ height: theme.spacing.xl }} />
    </Screen>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <Row style={{ alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
      <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
        <Text variant="body">{label}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: theme.colors.primary, false: theme.colors.surfaceRaised }}
      />
    </Row>
  );
}
