import { groupContacts, looksLikeNumber, matchChoice } from '../src/services/contacts';

describe('groupContacts', () => {
  it('merges duplicate numbers written differently', () => {
    const g = groupContacts([
      { name: 'Asanka Perera', number: '0771234567' },
      { name: 'Asanka Perera', number: '+94 77 123 4567' },
    ], 'asanka');
    expect(g).toHaveLength(1);
    expect(g[0].numbers).toHaveLength(1);
  });
  it('prefers an exact name match', () => {
    const g = groupContacts([
      { name: 'Asanka', number: '0711111111' },
      { name: 'Asanka Perera', number: '0722222222' },
    ], 'Asanka');
    expect(g.map((x) => x.name)).toEqual(['Asanka']);
  });
  it('returns every partial match when none is exact', () => {
    const g = groupContacts([
      { name: 'Asanka Perera', number: '0711111111' },
      { name: 'Asanka Silva', number: '0722222222' },
    ], 'Asanka');
    expect(g).toHaveLength(2);
  });
});

describe('matchChoice', () => {
  const options = [
    { label: 'Asanka Perera', value: 1 },
    { label: 'Asanka Silva', value: 2 },
  ];
  it('matches by surname', () => expect(matchChoice('the Silva one', options)?.value).toBe(2));
  it('matches by ordinal', () => expect(matchChoice('second', options)?.value).toBe(2));
  it('matches by digit', () => expect(matchChoice('1', options)?.value).toBe(1));
  it('matches Sinhala ordinals', () => expect(matchChoice('දෙවන එක', options)?.value).toBe(2));
  it('returns null when ambiguous', () => expect(matchChoice('Asanka', options)).toBeNull());
});

describe('looksLikeNumber', () => {
  it('detects phone numbers', () => {
    expect(looksLikeNumber('+94 77 123 4567')).toBe(true);
    expect(looksLikeNumber('Asanka')).toBe(false);
  });
});
