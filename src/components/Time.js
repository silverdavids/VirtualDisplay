import React from 'react';
import {getTime} from '../functions';

const Time = ({period, matchTime}) => {
  const timeStr = period === 2 ? 'HT' : period === 4 ? 'FT': `${getTime(matchTime)}'`;

  return <span className="fw-bold text-warning">
    {timeStr}
  </span>;
};

export default Time;
