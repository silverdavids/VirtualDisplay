import React from "react";
import {getGoalGoalOdds} from "../functions";
import { MARKET_BTS, MARKET_BTS_H1} from "../markets";

const GoalGoal = ({blocked, odds}) => {
  const goalGoalOdds = getGoalGoalOdds(odds,MARKET_BTS);
  const halfTimeGoalGoalOdds =getGoalGoalOdds(odds,MARKET_BTS_H1);

  return (blocked === 0 && goalGoalOdds.length > 0) ? <>
    {goalGoalOdds.map(({n, v}, index) => <td className="text-center" key={n}>
      {v.toFixed(2)}
      <br/>
      {halfTimeGoalGoalOdds.length > 0 && (<span>{halfTimeGoalGoalOdds[index].v.toFixed(2)}</span>)}
    </td>)}
  </> : <td colSpan="2"/>;
};
export default GoalGoal;
