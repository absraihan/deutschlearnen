import type { CefrLevel } from './types';

/**
 * Conversation modes. A mode gives the tutor a framing (what kind of exchange
 * this is) and, per level, a concrete opening plus vocabulary to steer towards.
 */
export interface ConversationMode {
  id: string;
  title: string;
  titleDe: string;
  emoji: string;
  /** Short line shown under the title in the picker. */
  description: string;
  /** Framing injected into the system prompt. */
  instruction: string;
  /** Levels this mode is offered at. */
  levels: CefrLevel[];
  /** Opening line the tutor says, per level. */
  openings: Partial<Record<CefrLevel, string>>;
  /** Words/phrases the tutor should try to work in, per level. */
  targetVocabulary?: Partial<Record<CefrLevel, string[]>>;
  /** True when the tutor should hold a character instead of being the tutor. */
  roleplay?: boolean;
}

const ALL: CefrLevel[] = ['A1', 'A2', 'B1', 'B2'];

export const CONVERSATION_MODES: ConversationMode[] = [
  {
    id: 'free',
    title: 'Free Conversation',
    titleDe: 'Freies Gespräch',
    emoji: '💬',
    description: 'Talk about anything, the tutor follows your lead',
    instruction:
      'Open, unstructured conversation. Follow whatever the learner brings up and keep it going with genuine curiosity.',
    levels: ALL,
    openings: {
      A1: 'Hallo! Schön, dass du da bist. Wie geht es dir heute?',
      A2: 'Hallo! Schön, dich zu sehen. Wie war dein Tag bisher?',
      B1: 'Hallo! Erzähl mal, was hat dich diese Woche beschäftigt?',
      B2: 'Hallo! Worüber möchtest du heute sprechen? Gibt es etwas, das dich gerade beschäftigt?',
    },
  },
  {
    id: 'daily-life',
    title: 'Daily Life',
    titleDe: 'Alltag',
    emoji: '🌅',
    description: 'Routines, chores, weekdays, habits',
    instruction:
      'Talk about everyday routines: getting up, work, meals, evenings, weekends. Stay concrete and personal.',
    levels: ALL,
    openings: {
      A1: 'Was machst du am Morgen? Stehst du früh auf?',
      A2: 'Erzähl mir von deinem Tagesablauf. Was machst du normalerweise am Vormittag?',
      B1: 'Wie sieht ein typischer Tag bei dir aus, und was würdest du gern daran ändern?',
      B2: 'Wie gut gelingt es dir, Arbeit und Freizeit im Alltag zu trennen?',
    },
    targetVocabulary: {
      A1: ['aufstehen', 'frühstücken', 'arbeiten', 'schlafen'],
      A2: ['der Tagesablauf', 'normalerweise', 'danach', 'gegen acht Uhr'],
      B1: ['die Routine', 'sich etwas vornehmen', 'der Feierabend'],
      B2: ['die Work-Life-Balance', 'der Alltagstrott', 'Prioritäten setzen'],
    },
  },
  {
    id: 'roleplay',
    title: 'Roleplay',
    titleDe: 'Rollenspiel',
    emoji: '🎭',
    description: 'Play a real situation with the tutor in character',
    instruction:
      'Stay fully in character for the chosen scenario. Do not break character unless the learner asks for help.',
    levels: ALL,
    roleplay: true,
    openings: {
      A1: 'Guten Tag! Was möchten Sie bestellen?',
      A2: 'Guten Tag! Wie kann ich Ihnen helfen?',
      B1: 'Guten Tag, schön dass Sie da sind. Nehmen Sie doch bitte Platz.',
      B2: 'Guten Tag. Bevor wir anfangen: Haben Sie noch Fragen zum Ablauf?',
    },
  },
  {
    id: 'travel',
    title: 'Travel',
    titleDe: 'Reisen',
    emoji: '✈️',
    description: 'Trips, airports, directions, plans',
    instruction:
      'Talk about travel: past trips, planning, transport, asking for directions, problems on the way.',
    levels: ALL,
    openings: {
      A1: 'Reist du gern? Wohin möchtest du fahren?',
      A2: 'Erzähl mir von deiner letzten Reise. Wohin bist du gefahren?',
      B1: 'Was war die interessanteste Reise deines Lebens, und warum?',
      B2: 'Wie stehst du zum Thema Massentourismus? Reist du bewusst anders?',
    },
    targetVocabulary: {
      A1: ['der Bahnhof', 'das Ticket', 'der Koffer', 'die Fahrkarte'],
      A2: ['umsteigen', 'die Verspätung', 'die Unterkunft', 'buchen'],
      B1: ['die Sehenswürdigkeit', 'sich verlaufen', 'die Reisevorbereitung'],
      B2: ['der Massentourismus', 'nachhaltig reisen', 'die Fernreise'],
    },
  },
  {
    id: 'restaurant',
    title: 'Restaurant',
    titleDe: 'Restaurant',
    emoji: '🍽️',
    description: 'Ordering, complaining, paying',
    instruction:
      'Restaurant situations: reading a menu, ordering, special requests, complaints, paying. You may play the waiter.',
    levels: ALL,
    roleplay: true,
    openings: {
      A1: 'Guten Tag! Was möchten Sie trinken?',
      A2: 'Guten Abend! Haben Sie reserviert? Möchten Sie die Karte sehen?',
      B1: 'Guten Abend! Unser Tagesgericht ist heute Rinderroulade. Darf ich Ihnen etwas empfehlen?',
      B2: 'Guten Abend! Wir arbeiten mit regionalen Zutaten. Haben Sie Unverträglichkeiten oder besondere Wünsche?',
    },
    targetVocabulary: {
      A1: ['die Speisekarte', 'bestellen', 'bezahlen', 'das Wasser'],
      A2: ['die Vorspeise', 'die Rechnung', 'getrennt zahlen', 'reservieren'],
      B1: ['empfehlen', 'die Beilage', 'sich beschweren'],
      B2: ['die Unverträglichkeit', 'regional und saisonal', 'das Preis-Leistungs-Verhältnis'],
    },
  },
  {
    id: 'shopping',
    title: 'Shopping',
    titleDe: 'Einkaufen',
    emoji: '🛒',
    description: 'Groceries, clothes, prices, returns',
    instruction:
      'Shopping situations: finding items, sizes and colours, prices, returns and complaints.',
    levels: ALL,
    openings: {
      A1: 'Was kaufst du normalerweise im Supermarkt?',
      A2: 'Ich brauche neue Schuhe. Kaufst du lieber online oder im Geschäft?',
      B1: 'Achtest du beim Einkaufen auf den Preis oder auf die Qualität?',
      B2: 'Wie stark beeinflusst Werbung deiner Meinung nach unser Kaufverhalten?',
    },
    targetVocabulary: {
      A1: ['der Supermarkt', 'kosten', 'billig', 'teuer'],
      A2: ['die Größe', 'umtauschen', 'das Sonderangebot', 'die Kasse'],
      B1: ['die Qualität', 'sich entscheiden für', 'die Garantie'],
      B2: ['das Kaufverhalten', 'der Konsum', 'nachhaltiger Konsum'],
    },
  },
  {
    id: 'work',
    title: 'Work',
    titleDe: 'Arbeit',
    emoji: '💼',
    description: 'Job, colleagues, meetings, tasks',
    instruction:
      'Work life: tasks, colleagues, meetings, deadlines, career. Ask what the learner actually does.',
    levels: ALL,
    openings: {
      A1: 'Was bist du von Beruf? Arbeitest du gern?',
      A2: 'Was machst du bei der Arbeit? Wie sind deine Kollegen?',
      B1: 'Was gefällt dir an deiner Arbeit am besten, und was nervt dich?',
      B2: 'Wie hat sich deine Branche in den letzten Jahren verändert?',
    },
    targetVocabulary: {
      A2: ['die Besprechung', 'der Kollege', 'die Aufgabe', 'die Schicht'],
      B1: ['die Verantwortung', 'der Termindruck', 'sich bewerben'],
      B2: ['die Führungskraft', 'die Digitalisierung', 'das Betriebsklima'],
    },
  },
  {
    id: 'doctor',
    title: 'Doctor',
    titleDe: 'Beim Arzt',
    emoji: '🩺',
    description: 'Symptoms, appointments, pharmacy',
    instruction:
      'Health situations: describing symptoms, making an appointment, the pharmacy. You may play the doctor or receptionist.',
    levels: ALL,
    roleplay: true,
    openings: {
      A1: 'Guten Tag! Was tut Ihnen weh?',
      A2: 'Guten Tag! Bitte setzen Sie sich. Was für Beschwerden haben Sie?',
      B1: 'Guten Tag! Seit wann haben Sie diese Beschwerden, und ist es schlimmer geworden?',
      B2: 'Guten Tag! Schildern Sie mir bitte den Verlauf. Gab es Vorerkrankungen in der Familie?',
    },
    targetVocabulary: {
      A1: ['der Kopf', 'wehtun', 'krank', 'die Tablette'],
      A2: ['die Beschwerden', 'das Rezept', 'der Termin', 'die Erkältung'],
      B1: ['die Untersuchung', 'die Nebenwirkung', 'überweisen'],
      B2: ['die Vorerkrankung', 'die Diagnose', 'der Krankheitsverlauf'],
    },
  },
  {
    id: 'hotel',
    title: 'Hotel',
    titleDe: 'Hotel',
    emoji: '🏨',
    description: 'Check-in, rooms, problems',
    instruction:
      'Hotel situations: booking, check-in, room problems, requests, check-out. You may play the receptionist.',
    levels: ALL,
    roleplay: true,
    openings: {
      A1: 'Guten Tag! Haben Sie eine Reservierung?',
      A2: 'Guten Tag! Willkommen. Auf welchen Namen läuft die Buchung?',
      B1: 'Guten Tag! Ihr Zimmer ist leider noch nicht fertig. Möchten Sie das Gepäck hier lassen?',
      B2: 'Guten Tag! Ich sehe, Sie hatten ein Problem mit dem Zimmer. Erzählen Sie mir bitte, was passiert ist.',
    },
  },
  {
    id: 'transport',
    title: 'Public Transport',
    titleDe: 'Öffentliche Verkehrsmittel',
    emoji: '🚆',
    description: 'Tickets, delays, connections',
    instruction:
      'Public transport: buying tickets, asking about connections, delays, lost items.',
    levels: ALL,
    openings: {
      A1: 'Fährst du mit dem Bus oder mit dem Zug?',
      A2: 'Ich muss nach München. Weißt du, wo ich eine Fahrkarte kaufen kann?',
      B1: 'Wie zuverlässig sind die öffentlichen Verkehrsmittel bei dir?',
      B2: 'Sollte der öffentliche Nahverkehr kostenlos sein? Was spricht dafür und dagegen?',
    },
    targetVocabulary: {
      A2: ['umsteigen', 'die Verspätung', 'der Anschluss', 'die Haltestelle'],
      B1: ['zuverlässig', 'der Nahverkehr', 'der Fahrplan'],
    },
  },
  {
    id: 'friends',
    title: 'Friends',
    titleDe: 'Freunde',
    emoji: '🧑‍🤝‍🧑',
    description: 'Friendship, plans, invitations',
    instruction:
      'Talk about friends: meeting up, making plans, invitations, what makes a good friendship. Use informal du.',
    levels: ALL,
    openings: {
      A1: 'Hast du viele Freunde? Was macht ihr zusammen?',
      A2: 'Was machst du am Wochenende mit deinen Freunden?',
      B1: 'Was ist für dich in einer Freundschaft am wichtigsten?',
      B2: 'Verändern sich Freundschaften, wenn man älter wird? Wie erlebst du das?',
    },
  },
  {
    id: 'family',
    title: 'Family',
    titleDe: 'Familie',
    emoji: '👨‍👩‍👧',
    description: 'Family members, home, traditions',
    instruction: 'Talk about family: members, where they live, traditions, family life.',
    levels: ALL,
    openings: {
      A1: 'Erzähl mir von deiner Familie. Hast du Geschwister?',
      A2: 'Wie oft siehst du deine Familie? Was macht ihr zusammen?',
      B1: 'Welche Rolle spielt die Familie in deinem Leben?',
      B2: 'Wie unterscheidet sich das Familienbild in Bangladesch von dem in Deutschland?',
    },
    targetVocabulary: {
      A1: ['die Mutter', 'der Vater', 'die Schwester', 'der Bruder'],
      A2: ['die Verwandten', 'zusammen', 'besuchen', 'die Großeltern'],
    },
  },
  {
    id: 'small-talk',
    title: 'Small Talk',
    titleDe: 'Small Talk',
    emoji: '☕',
    description: 'Weather, weekend, light chat',
    instruction:
      'Light social small talk: weather, weekend, the coffee queue. Keep turns short and friendly, like real small talk.',
    levels: ALL,
    openings: {
      A1: 'Wie ist das Wetter heute bei dir?',
      A2: 'Und, schon Pläne für das Wochenende?',
      B1: 'Ganz schön voll heute, oder? Wartest du schon lange?',
      B2: 'Man sieht sich ja selten. Was gibt es Neues bei dir?',
    },
  },
  {
    id: 'job-interview',
    title: 'Job Interview',
    titleDe: 'Vorstellungsgespräch',
    emoji: '🤝',
    description: 'Practise a German job interview',
    instruction:
      'Play a friendly but professional German interviewer. Use Sie. Ask one question at a time and follow up on the answers.',
    levels: ['A2', 'B1', 'B2'],
    roleplay: true,
    openings: {
      A2: 'Guten Tag! Bitte stellen Sie sich kurz vor.',
      B1: 'Guten Tag, schön dass Sie da sind. Erzählen Sie mir bitte etwas über Ihren beruflichen Werdegang.',
      B2: 'Guten Tag. Was hat Sie an dieser Stelle gereizt, und wo sehen Sie Ihre größten Stärken?',
    },
    targetVocabulary: {
      B1: ['die Erfahrung', 'die Stärke', 'die Schwäche', 'sich bewerben'],
      B2: ['der Werdegang', 'die Herausforderung', 'die Kompetenz', 'sich einbringen'],
    },
  },
  {
    id: 'exam',
    title: 'Exam Practice',
    titleDe: 'Prüfungstraining',
    emoji: '📝',
    description: 'Exam-style speaking tasks (not an official exam)',
    instruction:
      'Run an exam-style speaking task. Give the task, let the learner speak, then give structured feedback. This is exam-style practice, never claim it is an official exam.',
    levels: ALL,
    openings: {
      A1: 'Wir üben jetzt im Prüfungsstil. Aufgabe 1: Stellen Sie sich bitte vor. Name, Alter, Wohnort, Sprachen.',
      A2: 'Wir üben im Prüfungsstil. Aufgabe: Beschreiben Sie Ihren typischen Tagesablauf.',
      B1: 'Wir üben im Prüfungsstil. Aufgabe: Äußern Sie Ihre Meinung zum Thema Online-Lernen. Nennen Sie zwei Argumente.',
      B2: 'Wir üben im Prüfungsstil. Aufgabe: Diskutieren Sie Vor- und Nachteile von künstlicher Intelligenz am Arbeitsplatz.',
    },
  },
  {
    id: 'picture',
    title: 'Picture Description',
    titleDe: 'Bildbeschreibung',
    emoji: '🖼️',
    description: 'Describe a scene the tutor sets up in words',
    instruction:
      'Describe a scene in words for the learner (no image is shown), then ask them to describe it back, speculate about it, and answer questions about it.',
    levels: ALL,
    openings: {
      A1: 'Stell dir ein Bild vor: eine Familie im Park. Was siehst du auf dem Bild?',
      A2: 'Stell dir ein Bild vor: ein voller Bahnhof am Morgen. Beschreibe, was dort passiert.',
      B1: 'Stell dir ein Bild vor: ein Büro, in dem einige Menschen im Homeoffice zugeschaltet sind. Was fällt dir auf?',
      B2: 'Stell dir ein Foto vor: eine Demonstration für Klimaschutz. Beschreibe es und interpretiere die Stimmung.',
    },
  },
  {
    id: 'storytelling',
    title: 'Storytelling',
    titleDe: 'Geschichten erzählen',
    emoji: '📖',
    description: 'Tell a story, the tutor keeps it going',
    instruction:
      'Ask the learner to tell a story from their life or invent one. Prompt for the next part, ask about details, keep the narrative moving. Past tenses are the focus.',
    levels: ALL,
    openings: {
      A1: 'Erzähl mir etwas: Was hast du gestern gemacht?',
      A2: 'Erzähl mir eine kleine Geschichte: Was war dein schönstes Erlebnis in diesem Jahr?',
      B1: 'Erzähl mir von einer Situation, in der etwas völlig schiefgegangen ist.',
      B2: 'Erzähl mir eine Geschichte, die dich verändert hat. Nimm dir Zeit für die Details.',
    },
  },
  {
    id: 'debate',
    title: 'Debate',
    titleDe: 'Debatte',
    emoji: '⚖️',
    description: 'Argue a position, the tutor pushes back',
    instruction:
      'Take the opposing position politely and push back on the learner arguments, so they have to justify and defend. Stay respectful.',
    levels: ['B1', 'B2'],
    openings: {
      B1: 'Heute diskutieren wir: Ist Homeoffice besser als Büroarbeit? Ich bin dagegen. Überzeuge mich!',
      B2: 'These: Künstliche Intelligenz wird mehr Arbeitsplätze schaffen als vernichten. Ich halte dagegen. Deine Argumente?',
    },
  },
  {
    id: 'problem-solving',
    title: 'Problem Solving',
    titleDe: 'Probleme lösen',
    emoji: '🧩',
    description: 'Work through a practical problem in German',
    instruction:
      'Present a realistic everyday problem and work through it together: the learner proposes solutions, you raise complications.',
    levels: ALL,
    openings: {
      A1: 'Problem: Du hast deinen Schlüssel verloren. Was machst du?',
      A2: 'Problem: Dein Zug fällt aus und du hast einen wichtigen Termin. Was machst du?',
      B1: 'Problem: Dein Nachbar macht jede Nacht laute Musik. Wie gehst du vor?',
      B2: 'Problem: In deinem Team gibt es einen Konflikt zwischen zwei Kollegen. Wie löst du das?',
    },
  },
  {
    id: 'random',
    title: 'Random Topic',
    titleDe: 'Zufallsthema',
    emoji: '🎲',
    description: 'The tutor picks a fresh topic for you',
    instruction:
      'Pick one concrete, slightly unusual topic appropriate for the level and open with it. Do not ask the learner to choose.',
    levels: ALL,
    openings: {
      A1: 'Heute ein Zufallsthema: Tiere! Hast du ein Haustier?',
      A2: 'Zufallsthema: Kochen! Was kochst du am liebsten?',
      B1: 'Zufallsthema: Aberglaube. Glaubst du an so etwas wie Glück oder Pech?',
      B2: 'Zufallsthema: Sollten Städte autofrei werden? Was denkst du?',
    },
  },
];

export function getMode(id: string): ConversationMode | undefined {
  return CONVERSATION_MODES.find((m) => m.id === id);
}

export function modesForLevel(level: CefrLevel): ConversationMode[] {
  return CONVERSATION_MODES.filter((m) => m.levels.includes(level));
}

/** A concrete roleplay scenario the tutor can hold a character in. */
export interface RoleplayScenario {
  id: string;
  level: CefrLevel;
  title: string;
  titleDe: string;
  emoji: string;
  /** Who the AI plays. */
  aiRole: string;
  /** Who the learner plays. */
  userRole: string;
  /** Situation description injected into the prompt. */
  setting: string;
  /** What the learner has to accomplish. */
  goal: string;
  opening: string;
  usesFormalSie: boolean;
  keyPhrases: string[];
}

export const ROLEPLAY_SCENARIOS: RoleplayScenario[] = [
  {
    id: 'cafe-order',
    level: 'A1',
    title: 'Ordering a coffee',
    titleDe: 'Im Café bestellen',
    emoji: '☕',
    aiRole: 'a friendly barista in a small German café',
    userRole: 'a customer',
    setting: 'A small café in Berlin, mid-morning, not busy.',
    goal: 'Order a drink and something to eat, ask the price, and pay.',
    opening: 'Guten Tag! Was darf es sein?',
    usesFormalSie: true,
    keyPhrases: ['Ich möchte einen Kaffee.', 'Was kostet das?', 'Ich zahle bar.'],
  },
  {
    id: 'bakery',
    level: 'A1',
    title: 'At the bakery',
    titleDe: 'In der Bäckerei',
    emoji: '🥐',
    aiRole: 'a baker behind the counter',
    userRole: 'a customer buying breakfast',
    setting: 'A German bakery early in the morning.',
    goal: 'Buy bread rolls and a coffee, and ask for a bag.',
    opening: 'Guten Morgen! Der Nächste bitte. Was möchten Sie?',
    usesFormalSie: true,
    keyPhrases: ['drei Brötchen', 'zum Mitnehmen', 'Sonst noch etwas?'],
  },
  {
    id: 'introduce-neighbour',
    level: 'A1',
    title: 'Meeting a new neighbour',
    titleDe: 'Die neue Nachbarin',
    emoji: '🚪',
    aiRole: 'a curious but friendly neighbour',
    userRole: 'someone who just moved in',
    setting: 'In the stairwell of an apartment building.',
    goal: 'Introduce yourself: name, where you come from, what you do.',
    opening: 'Hallo! Sind Sie neu hier im Haus? Ich bin Frau Weber aus dem zweiten Stock.',
    usesFormalSie: true,
    keyPhrases: ['Ich heiße ...', 'Ich komme aus ...', 'Ich wohne jetzt hier.'],
  },
  {
    id: 'train-station',
    level: 'A2',
    title: 'At the train station',
    titleDe: 'Am Bahnhof',
    emoji: '🚉',
    aiRole: 'a Deutsche Bahn ticket counter employee',
    userRole: 'a traveller who needs to get to Hamburg today',
    setting: 'A busy main station. The direct train is cancelled.',
    goal: 'Buy a ticket, understand the connection, and react to the cancellation.',
    opening: 'Guten Tag! Wohin möchten Sie fahren?',
    usesFormalSie: true,
    keyPhrases: ['einfach oder hin und zurück', 'umsteigen in', 'Gleis 7', 'die Verspätung'],
  },
  {
    id: 'doctor-appointment',
    level: 'A2',
    title: 'Making a doctor appointment',
    titleDe: 'Termin beim Arzt',
    emoji: '📞',
    aiRole: 'a medical receptionist on the phone',
    userRole: 'a patient with a bad cold',
    setting: 'A phone call to a GP practice. The first free slot is in two weeks.',
    goal: 'Describe your symptoms and get an earlier appointment.',
    opening: 'Praxis Dr. Neumann, guten Tag. Was kann ich für Sie tun?',
    usesFormalSie: true,
    keyPhrases: ['Ich hätte gern einen Termin.', 'Ich habe Halsschmerzen.', 'Geht es früher?'],
  },
  {
    id: 'apartment-viewing',
    level: 'A2',
    title: 'Apartment viewing',
    titleDe: 'Wohnungsbesichtigung',
    emoji: '🏠',
    aiRole: 'a landlord showing a flat',
    userRole: 'an interested tenant',
    setting: 'A two-room flat, several other applicants are waiting.',
    goal: 'Ask about rent, extra costs, and when you could move in.',
    opening: 'Guten Tag, kommen Sie herein. Das ist das Wohnzimmer. Haben Sie Fragen?',
    usesFormalSie: true,
    keyPhrases: ['die Kaltmiete', 'die Nebenkosten', 'ab wann frei', 'die Kaution'],
  },
  {
    id: 'job-interview-b1',
    level: 'B1',
    title: 'Job interview',
    titleDe: 'Vorstellungsgespräch',
    emoji: '🤝',
    aiRole: 'an HR manager at a mid-sized German company',
    userRole: 'a candidate for a job you actually want',
    setting: 'A 20-minute first interview in an office.',
    goal: 'Present your background, your strengths, and ask one good question.',
    opening:
      'Guten Tag, schön dass Sie da sind. Erzählen Sie mir doch bitte kurz etwas über sich.',
    usesFormalSie: true,
    keyPhrases: ['der Werdegang', 'meine Stärken', 'Teamarbeit', 'Ich würde gern wissen, ob ...'],
  },
  {
    id: 'complaint',
    level: 'B1',
    title: 'Complaining about a product',
    titleDe: 'Reklamation',
    emoji: '📦',
    aiRole: 'a customer service employee who is reluctant to refund',
    userRole: 'a customer with a broken product bought three weeks ago',
    setting: 'The service desk of an electronics shop.',
    goal: 'Explain the problem, insist politely, and get a solution.',
    opening: 'Guten Tag, was kann ich für Sie tun?',
    usesFormalSie: true,
    keyPhrases: ['Ich möchte reklamieren.', 'die Garantie', 'Das ist nicht akzeptabel.', 'umtauschen'],
  },
  {
    id: 'remote-work-debate',
    level: 'B2',
    title: 'Debating remote work',
    titleDe: 'Homeoffice diskutieren',
    emoji: '💻',
    aiRole: 'a sceptical department head who wants everyone back in the office',
    userRole: 'an employee arguing for remote work',
    setting: 'A one-on-one meeting about the new attendance policy.',
    goal: 'Argue for remote work with concrete advantages, and address the counter-arguments.',
    opening:
      'Setzen Sie sich. Ich will offen sein: Ich halte Homeoffice für einen Produktivitätskiller. Überzeugen Sie mich vom Gegenteil.',
    usesFormalSie: true,
    keyPhrases: [
      'meiner Meinung nach',
      'einerseits ... andererseits',
      'das lässt sich belegen',
      'ich stimme Ihnen insofern zu, als ...',
    ],
  },
  {
    id: 'salary-negotiation',
    level: 'B2',
    title: 'Salary negotiation',
    titleDe: 'Gehaltsverhandlung',
    emoji: '💶',
    aiRole: 'a manager with a tight budget',
    userRole: 'an employee asking for a raise',
    setting: 'An annual review meeting.',
    goal: 'Justify a raise with concrete achievements and negotiate an outcome.',
    opening: 'Sie wollten über Ihr Gehalt sprechen. Ich höre.',
    usesFormalSie: true,
    keyPhrases: [
      'Ich habe maßgeblich dazu beigetragen, dass ...',
      'die Verantwortung ist gewachsen',
      'marktüblich',
      'Wären Sie bereit, ...?',
    ],
  },
];

export function roleplaysForLevel(level: CefrLevel): RoleplayScenario[] {
  return ROLEPLAY_SCENARIOS.filter((s) => s.level === level);
}

export function getRoleplay(id: string): RoleplayScenario | undefined {
  return ROLEPLAY_SCENARIOS.find((s) => s.id === id);
}
