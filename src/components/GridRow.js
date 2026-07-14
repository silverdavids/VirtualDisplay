

  import {
    GoalGoal,
    MatchResult,
    OverUnder
   // Time,
  } from './index';
  import React from 'react';
  const GridRow = ({ game }) => {
    // console.log(game);
    const {
      awayTeam,
      homeTeam,
      betServiceMatchNo,
      //matchTime,
      odds,
      blocked,
      shortCode,
      //period,
    }= game;
    return (
     ( game !=null)>0?
      <tr key={betServiceMatchNo} >
        <td>{shortCode}</td>

        <td>
        <span>{homeTeam} </span>
        <br />
        <span>{awayTeam} </span>
      </td>
        {<><MatchResult blocked={blocked} odds={odds} />
        <OverUnder blocked={blocked} odds={odds} />
        <GoalGoal blocked={blocked} odds={odds} />
        </>
     }
        
      </tr>:<td></td>
    );
  };
  
  export default GridRow;
  