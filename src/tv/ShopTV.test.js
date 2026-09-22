import {act,fireEvent,render,screen,within} from '@testing-library/react';
import ShopTV from './ShopTV';
import useTVFeed from './useTVFeed';
import capture from './fixtures/real-feed.json';
import {applyTVPayload,emptyFeed,visibleFeed} from './tvData';
jest.mock('./useTVFeed');
const now=Date.parse(capture.rest['21-queue'].receivedAt);
const actualFeed=id=>({...visibleFeed(applyTVPayload(applyTVPayload(emptyFeed(),id,'queue',capture.rest[`${id}-queue`].payload,now),id,'results',capture.rest[`${id}-results`].payload,now),now),connected:true});
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(now);useTVFeed.mockImplementation(actualFeed);});
afterEach(()=>jest.useRealTimers());

test('four channel choices open the right fullscreen route',()=>{
  const navigate=jest.fn();const requestFullscreen=jest.fn().mockResolvedValue();
  document.documentElement.requestFullscreen=requestFullscreen;
  render(<ShopTV path="/tv" search="" navigate={navigate}/>);
  const links=screen.getAllByRole('link');expect(links).toHaveLength(4);
  links.forEach(link=>{fireEvent.click(link);expect(navigate).toHaveBeenLastCalledWith(link.getAttribute('href'));});
  expect(requestFullscreen).toHaveBeenCalledTimes(4);
  delete document.documentElement.requestFullscreen;
});

test.each(['21','78'])('%s standard channel uses real ten-match odds and contains no betting controls',id=>{
  render(<ShopTV path={`/tv/${id}/standard`} search="?rotate=0" navigate={jest.fn()}/>);
  expect(screen.getByRole('heading',{name:id==='21'?'Champions':'EPL'})).toBeInTheDocument();
  expect(screen.getByText(`WEEK ${id==='21'?'24':'11'}`)).toBeInTheDocument();
  const table=screen.getByRole('table',{name:'Match odds'});
  expect(within(table).getAllByRole('row')).toHaveLength(12);
  for(const label of ['1','X','2','1X','12','X2','GG','NG','OV 2.5','UN 2.5']) expect(within(table).getByRole('columnheader',{name:label,exact:true})).toBeInTheDocument();
  expect(screen.getByLabelText('Results ticker')).toHaveTextContent('LATEST RESULTS');
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button').map(button=>button.textContent)).toEqual(['⛶','Channels']);
  expect(screen.queryByText(/Print ticket|Stake|Payout|Search|Bet slip/i)).not.toBeInTheDocument();
});

test.each(['21','78'])('%s Correct Score matrix displays all captured outcomes without betting buttons',id=>{
  render(<ShopTV path={`/tv/${id}/correct-score`} search="?rotate=0" navigate={jest.fn()}/>);
  const table=screen.getByRole('table',{name:'Correct Score'});
  expect(within(table).getAllByRole('row')).toHaveLength(12);
  expect(within(table).getAllByRole('cell')).toHaveLength(280);
  for(const name of ['HOME WINS','DRAWS','AWAY WINS']) expect(within(table).getByText(name)).toBeInTheDocument();
  expect(within(table).queryByRole('button')).not.toBeInTheDocument();
});

test('rotation uses the configurable dwell time and excludes unavailable standings',()=>{
  render(<ShopTV path="/tv/78/standard" search="?seconds=40" navigate={jest.fn()}/>);
  act(()=>jest.advanceTimersByTime(39000));expect(screen.getByRole('table',{name:'Match odds'})).toBeInTheDocument();
  act(()=>jest.advanceTimersByTime(1000));expect(screen.getByRole('table',{name:'Over / Under'})).toBeInTheDocument();
  expect(screen.queryByText('League standings')).not.toBeInTheDocument();
});

test('missing Correct Score odds show unavailable instead of an invented matrix',()=>{
  const feed=actualFeed('21');feed.board={...feed.board,events:feed.board.events.map(event=>({...event,markets:[]}))};
  useTVFeed.mockReturnValue(feed);
  render(<ShopTV path="/tv/21/correct-score" search="" navigate={jest.fn()}/>);
  expect(screen.getByText('Correct Score unavailable')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('rotation can enter results when it is the only remaining supported view',()=>{
  useTVFeed.mockReturnValue({...actualFeed('21'),board:null});
  render(<ShopTV path="/tv/21/standard" search="?seconds=15" navigate={jest.fn()}/>);
  expect(screen.getByText('Waiting for the next virtual event')).toBeInTheDocument();
  act(()=>jest.advanceTimersByTime(15000));
  expect(screen.getByRole('table',{name:'Completed results'})).toBeInTheDocument();
});

test('optional standings render only when supplied: explicit synthetic metadata over captured EPL odds',()=>{
  useTVFeed.mockReturnValue({...actualFeed('78'),standings:[{teamName:'ARS',played:11,goalDifference:8,points:24}]});
  render(<ShopTV path="/tv/78/standard" search="?rotate=0" navigate={jest.fn()}/>);
  expect(screen.getByRole('table',{name:'EPL standings'})).toHaveTextContent('ARS');
  expect(screen.getByRole('table',{name:'EPL standings'})).toHaveTextContent('24');
});

test('a live view and ticker update independently from upcoming odds using synthetic score deltas',()=>{
  const feed=actualFeed('21');
  feed.live={...feed.board,state:'LIVE',minute:22,events:feed.board.events.map(event=>({...event,homeScore:1,awayScore:0}))};
  useTVFeed.mockReturnValue(feed);
  const {rerender}=render(<ShopTV path="/tv/21/standard" search="?seconds=15" navigate={jest.fn()}/>);
  act(()=>jest.advanceTimersByTime(7*15000));
  expect(screen.getByRole('table',{name:'Live scores'})).toHaveTextContent('22′');
  expect(screen.getByLabelText('Results ticker')).toHaveTextContent('LIVE SCORES');
  feed.live={...feed.live,minute:38,events:feed.live.events.map(event=>({...event,awayScore:1}))};
  rerender(<ShopTV path="/tv/21/standard" search="?seconds=15" navigate={jest.fn()}/>);
  expect(screen.getByRole('table',{name:'Live scores'})).toHaveTextContent('38′');
  expect(screen.getByLabelText('Results ticker')).toHaveTextContent('1 : 1');
});
