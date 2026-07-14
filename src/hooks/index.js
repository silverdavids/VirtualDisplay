import {useEffect, useState} from 'react';
import * as Observables from '../rxjs-stores';
import connect from "../socketio.service";

export const useDate = () => {
  const [date, setDate] = useState(new Date());

  useEffect(() => {
    setInterval(() => setDate(() => new Date()), 1000);
  }, []);
  return {date};
};

export const useLiveGames = () => {
  const [liveGames, setLiveGames] = useState(null);

  useEffect(() => {
    const sub = Observables.liveGames$.subscribe({
      next: (data) => {
        setLiveGames(() => data);
      }
    });
    return () => {
      sub.unsubscribe();
    };
  }, []);

  return {
    liveGames,
    totalGames: liveGames ? Object.keys(liveGames).length: 0
  };
};

/**
 * Just use but do not page the devil
 */
export const usePage = (delayInMilliseconds, pageSize, totalGames) => {
  const [state, setState] = useState({
    page: 1,
    totalPages: Math.ceil(totalGames / pageSize)
  });

  useEffect(() => {
    const num = setInterval(() => {
      const newTotalPages = Math.ceil(totalGames / pageSize);
      setState(prevState => ({
        page: prevState.page + 1 > prevState.totalPages ? 1 : prevState.page + 1,
        totalPages: newTotalPages
      }));
    }, delayInMilliseconds);
    return () => clearInterval(num);
  }, [delayInMilliseconds, pageSize, totalGames]);

  return state;
};

export const useSocketIO = () => {
  alert("connecting");
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    connect().on('connect', function(){
      setConnected(() => true);
    });
  }, []);
  alert(connected);
  return {connected};
};
