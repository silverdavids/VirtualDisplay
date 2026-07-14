import { liveGames$ } from '.';

const virtualGamesStorage = (() => {
  let games = {};

  /**
   * add a game
   * @param {object} game
   */
  const addOrUpdate = (game) => {
   // alert(game);
    const { betServiceMatchNo } = game;
    if (!betServiceMatchNo) return;

    games = { ...games, [betServiceMatchNo]: game };
    alert("seen "+betServiceMatchNo);
    liveGames$.next(games);
  };
  const removeEvent = (eventId) => {
    delete games[eventId];
    liveGames$.next(games);
  };

  return {
    addOrUpdate,removeEvent
  };
})();

export default virtualGamesStorage;
