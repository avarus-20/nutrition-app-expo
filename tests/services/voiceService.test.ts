import { textToDraft, transcribeVoiceNote } from '@/services/recognitionFlows';
import { formatDuration } from '@/features/voice/duration';
import type { RecognitionGateway } from '@/services/recognition';
import { MAX_VOICE_NOTES_PER_MEAL, type RecordedAudio } from '@/services/voiceService';
import { SyncEngine } from '@/sync/syncEngine';
import { FakeRemote } from '../helpers/fakeRemote';
import { item, servicesFor, setupDb } from '../helpers/fixtures';

const DAY = '2024-05-01';
const USER = '11111111-1111-4111-8111-111111111111';
const audio = (overrides: Partial<RecordedAudio> = {}): RecordedAudio => ({
  uri: 'recorder://note-1',
  mimeType: 'audio/mp4',
  durationMs: 4200,
  ...overrides,
});

describe('VoiceService', () => {
  it('stores a recording on the device with a pending upload', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const mealId = await s.meals.ensureMeal({ date: DAY, mealType: 'dinner' });
    const id = await s.voice.add(mealId, audio());
    expect(await s.voice.get(id)).toMatchObject({
      meal_id: mealId,
      mime_type: 'audio/mp4',
      duration_ms: 4200,
      upload_status: 'pending',
      local_uri: `file:///media/${id}.m4a`,
      transcript: null,
    });
    expect((await s.meals.mediaCounts(DAY)).get(mealId)).toEqual({ photos: 0, voice: 1 });
  });

  it('uses the content type reported by the platform (web recordings) and strips codec parameters', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const mealId = await s.meals.ensureMeal({ date: DAY, mealType: 'dinner' });
    const persist = s.files.persistFile.bind(s.files);
    s.files.persistFile = async (uri, name) => ({ ...(await persist(uri, name)), mimeType: 'audio/ogg;codecs=opus' });
    const id = await s.voice.add(mealId, audio({ mimeType: 'audio/webm' }));
    expect((await s.voice.get(id))?.mime_type).toBe('audio/ogg');

    s.files.persistFile = async (uri, name) => ({ ...(await persist(uri, name)), mimeType: 'video/mp4' });
    await expect(s.voice.add(mealId, audio())).rejects.toMatchObject({ code: 'validation' });
  });

  it('enforces limits and rejects empty recordings', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    await expect(s.voice.add('00000000-0000-4000-8000-000000000000', audio())).rejects.toMatchObject({ code: 'not_found' });
    const mealId = await s.meals.ensureMeal({ date: DAY, mealType: 'dinner' });
    s.files.persistSize = 0;
    await expect(s.voice.add(mealId, audio())).rejects.toMatchObject({ code: 'validation' });
    expect(s.files.files.size).toBe(0);
    s.files.persistSize = null;
    for (let i = 0; i < MAX_VOICE_NOTES_PER_MEAL; i++) await s.voice.add(mealId, audio({ uri: `recorder://${i}` }));
    await expect(s.voice.add(mealId, audio())).rejects.toMatchObject({ code: 'validation' });
  });

  it('deletes a note (soft, synchronized) and frees the device copy', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const mealId = await s.meals.ensureMeal({ date: DAY, mealType: 'dinner' });
    const id = await s.voice.add(mealId, audio());
    await s.voice.remove(id);
    expect(await s.voice.forMeal(mealId)).toEqual([]);
    expect((await s.voice.get(id))?.local_uri).toBeNull();
    expect(s.files.files.size).toBe(0);
  });

  it('uploads, syncs the transcript and downloads on another device', async () => {
    const remote = new FakeRemote();
    remote.authUser = USER;
    const dbA = await setupDb();
    const a = servicesFor(dbA, { id: USER });
    const mealId = await a.meals.ensureMeal({ date: DAY, mealType: 'dinner' });
    const id = await a.voice.add(mealId, audio());
    await a.voice.setTranscript(id, '  two eggs and coffee ');
    expect(await new SyncEngine(dbA, remote, { userId: () => USER }).sync()).toMatchObject({ status: 'ok', uploaded: 1 });
    expect(remote.table('voice_notes').get(id)).toMatchObject({ transcript: 'two eggs and coffee', storage_path: `${USER}/voice/${id}.m4a` });

    const dbB = await setupDb();
    const b = servicesFor(dbB, { id: USER });
    await new SyncEngine(dbB, remote, { userId: () => USER }).sync();
    const note = await b.voice.get(id);
    expect(note).toMatchObject({ transcript: 'two eggs and coffee', local_uri: null });
    const uri = await b.voice.ensureLocal(note!, (p) => remote.downloadFile(p));
    expect(uri).toBe(`file:///media/${id}.m4a`);
  });
});

describe('voice → draft flow', () => {
  it('parses typed text offline, fills nutrition from saved foods and links the voice note', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    await s.foods.create({
      name: 'Kananmuna',
      brand: null,
      barcode: null,
      serving_size: 1,
      serving_unit: 'piece',
      calories: 75,
      protein_g: 6.5,
      carbs_g: 0.3,
      fat_g: 5,
      fiber_g: null,
      sugar_g: null,
      salt_g: null,
    });
    await s.meals.addItemsToDay({ date: '2024-04-30', mealType: 'breakfast' }, [item({ food_name: 'Kahvi', quantity: 1, unit: 'cup', calories: 5 })]);
    const mealId = await s.meals.ensureMeal({ date: DAY, mealType: 'breakfast' });
    const noteId = await s.voice.add(mealId, audio());

    const draftId = await textToDraft(s, 'Söin kaksi kananmunaa ja kahvia', { date: DAY, mealType: 'breakfast', mealId }, noteId);
    const draft = await s.drafts.get(draftId);
    expect(draft).toMatchObject({ source: 'voice', voice_note_id: noteId, input_text: 'Söin kaksi kananmunaa ja kahvia' });
    expect(draft?.items.map((i) => [i.food_name, i.quantity, i.unit, i.calories])).toEqual([
      ['Kananmuna', 2, 'piece', 150],
      ['Kahvi', 1, 'cup', 5],
    ]);
    expect((await s.voice.get(noteId))?.transcript).toBe('Söin kaksi kananmunaa ja kahvia');

    await s.drafts.confirm(draftId, [item({ food_name: 'Kananmuna', quantity: 2, calories: 150 })]);
    const day = await s.meals.getDay(DAY);
    expect(day[0]?.items.map((i) => i.source)).toEqual(['voice']);
  });

  it('reports when nothing can be recognized', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    await expect(textToDraft(s, ' , . ', { date: DAY, mealType: 'snack' }, null)).rejects.toMatchObject({ code: 'validation' });
  });

  it('sends the stored recording to speech-to-text', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const mealId = await s.meals.ensureMeal({ date: DAY, mealType: 'lunch' });
    const noteId = await s.voice.add(mealId, audio({ uri: 'abc' }));
    const calls: unknown[] = [];
    const recognition: RecognitionGateway = {
      estimatePhoto: () => Promise.reject(new Error('unused')),
      transcribe: async (req) => {
        calls.push(req);
        return { text: ' два яйца ' };
      },
    };
    expect(await transcribeVoiceNote(s, recognition, noteId, 'ru-RU')).toBe('два яйца');
    expect(calls).toEqual([{ audioBase64: Buffer.from('abc').toString('base64'), mimeType: 'audio/mp4', locale: 'ru-RU' }]);
    await expect(transcribeVoiceNote(s, null, noteId, 'ru')).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(75_000)).toBe('1:15');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(null)).toBe('0:00');
  });
});
