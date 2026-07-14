import React from 'react';
import {getFullTimeOddsUnderOver, getHalfTimeOddsUnderOver} from "../functions";

const OverUnder = ({ blocked, odds }) => {
  if (blocked !== 0) return <td className='opacity-90' colSpan='3' />;

  const { line: halfTimeLine, wireOdds: halfTimeOdds } = getHalfTimeOddsUnderOver(odds);
  const { line: fullTimeLine, wireOdds: fullTimeOdds } = getFullTimeOddsUnderOver(odds);

  return (
    <>
      {fullTimeLine > 0 && (
        <td className='opacity-90 text-center'>
          <span className='text-warning'>{fullTimeLine}</span>
          <br />
          {halfTimeOdds.length > 0 && <span>{halfTimeLine}</span>}
        </td>
      )}
      {fullTimeLine === 0 && <td className='opacity-90' />}
      {fullTimeOdds.length > 0 &&
        fullTimeOdds.map(({ n, v }, index) => (
          <td className='opacity-90 text-center' key={n}>
            <span>{v.toFixed(2)}</span>
            <br />
            {halfTimeOdds.length > 0 && (
              <span>{halfTimeOdds[index].v.toFixed(2)}</span>
            )}
          </td>
        ))}
      {fullTimeOdds.length === 0 && <td className='opacity-90' colSpan='2' />}
    </>
  );
};

export default OverUnder;
