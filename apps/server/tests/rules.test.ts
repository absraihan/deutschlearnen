import { describe, expect, it } from 'vitest';
import { checkGerman } from '../src/providers/ai/rules';

/**
 * The four correction examples from the specification, level by level, plus the
 * umlaut/eszett handling that the German pipeline lives or dies by.
 */
describe('German correction rules', () => {
  it('A1: fixes a missing accusative article', () => {
    const hit = checkGerman('Ich möchte ein Kaffee.');
    expect(hit).not.toBeNull();
    expect(hit!.corrected).toBe('Ich möchte einen Kaffee.');
    expect(hit!.category).toBe('case');
    expect(hit!.explanation).toContain('Akkusativ');
  });

  it('A2: fixes haben/sein in the Perfekt', () => {
    const hit = checkGerman('Ich habe gegangen.');
    expect(hit!.corrected).toBe('Ich bin gegangen.');
    expect(hit!.category).toBe('auxiliary-verb');
    expect(hit!.explanation).toContain('sein');
  });

  it('A2: fixes the spec example "Gestern ich habe zum Markt gegangen."', () => {
    const hit = checkGerman('Gestern ich habe zum Markt gegangen.');
    expect(hit!.corrected).toBe('Gestern bin ich zum Markt gegangen.');
  });

  it('B1: fixes verb-second word order after a time expression', () => {
    const hit = checkGerman('Gestern ich gehe zum Supermarkt.');
    expect(hit!.corrected).toBe('Gestern gehe ich zum Supermarkt.');
    expect(hit!.category).toBe('word-order');
  });

  it('B2: moves the conjugated verb to the end of a dass-clause', () => {
    const hit = checkGerman('Ich finde, dass Homeoffice ist besser.');
    expect(hit!.corrected).toBe('Ich finde, dass Homeoffice besser ist.');
    expect(hit!.category).toBe('subordinate-clause');
    expect(hit!.explanation).toContain('Ende');
  });

  it('also handles weil- and obwohl-clauses', () => {
    expect(checkGerman('Ich bleibe zu Hause, weil ich bin krank.')!.corrected).toBe(
      'Ich bleibe zu Hause, weil ich krank bin.',
    );
  });

  it('leaves correct German alone', () => {
    expect(checkGerman('Gestern bin ich zum Markt gegangen.')).toBeNull();
    expect(checkGerman('Ich möchte einen Kaffee.')).toBeNull();
    expect(checkGerman('Hallo!')).toBeNull();
    expect(checkGerman('')).toBeNull();
  });

  it('preserves umlauts and eszett in the corrected sentence', () => {
    const hit = checkGerman('Ich möchte ein Kaffee für meine Grüße aus der Straße.');
    expect(hit!.corrected).toContain('möchte einen Kaffee');
    expect(hit!.corrected).toContain('Grüße');
    expect(hit!.corrected).toContain('Straße');
  });

  it('provides Bangla and English explanations for every rule', () => {
    for (const sentence of [
      'Ich habe gegangen.',
      'Gestern ich gehe zum Supermarkt.',
      'Ich finde, dass Homeoffice ist besser.',
      'Ich möchte ein Kaffee.',
    ]) {
      const hit = checkGerman(sentence);
      expect(hit!.explanationEn.length).toBeGreaterThan(10);
      expect(hit!.explanationBn.length).toBeGreaterThan(5);
    }
  });
});
