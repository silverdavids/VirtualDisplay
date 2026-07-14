import React from "react";
import {getFullTimeOddsMatchResult, getHalfTimeOddsMatchResult} from "../functions";

const MatchResult = ({blocked, odds}) => {
  const halfTimeOdds = getHalfTimeOddsMatchResult(odds);
  const fullTimeOdds = getFullTimeOddsMatchResult(odds);

  if (blocked === 0 && fullTimeOdds.length > 0) {
    return fullTimeOdds.map(({n, v}, index) => <td className="text-center" key={n}>
      <span>{v.toFixed(2)}</span>
      <br/>
      {(halfTimeOdds.length > 0&&halfTimeOdds[index]!==undefined) && (<span>{halfTimeOdds[index].v.toFixed(2)}</span>)}
    </td>);
  }

  return <td colSpan="3"/>;
};

export default MatchResult;
