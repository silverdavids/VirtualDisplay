import {getUniqueDisplayEvents} from './Grid';

describe('getUniqueDisplayEvents', () => {
  it('removes repeated fixtures before applying the row limit', () => {
    const firstBoard = Array.from({length: 9}, (_, index) => ({
      id: index + 1,
      homeTeam: `Home ${index + 1}`,
      awayTeam: `Away ${index + 1}`,
    }));
    const nextFixture = {id: 10, homeTeam: 'Home 10', awayTeam: 'Away 10'};

    const events = getUniqueDisplayEvents([...firstBoard, ...firstBoard, nextFixture], 10);

    expect(events).toHaveLength(10);
    expect(events.map(({id}) => id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('uses match identifiers when team names are unavailable', () => {
    const events = getUniqueDisplayEvents([
      {matchId: 'match-1'},
      {matchId: 'match-1'},
      {matchId: 'match-2'},
    ]);

    expect(events).toHaveLength(2);
    expect(events.map(({matchId}) => matchId)).toEqual(['match-1', 'match-2']);
  });

  it('creates unique fixture keys when the feed reuses a board event id', () => {
    const events = getUniqueDisplayEvents([
      {eventId: 'board-21', homeTeam: 'MAR', awayTeam: 'MUN'},
      {eventId: 'board-21', homeTeam: 'CEL', awayTeam: 'ROM'},
      {eventId: 'board-21', homeTeam: 'BAR', awayTeam: 'ATM'},
    ]);

    expect(new Set(events.map(({displayKey}) => displayKey)).size).toBe(3);
    expect(events.map(({displayKey}) => displayKey)).toEqual([
      'teams:MAR:MUN',
      'teams:CEL:ROM',
      'teams:BAR:ATM',
    ]);
  });
});
