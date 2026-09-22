const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const weeks = id => id === '21' ? [21, 3, 22, 4, 23] : [38, 1, 2, 3, 4];
const board = (id, index = 0) => ({
  provider: 'VirtualHorizon', leagueId: id, leagueNumber: '1001', weekNumber: weeks(id)[index] ?? index,
  leagueName: id === '21' ? 'Champions League' : 'Premier League', providerEventId: `event-${id}-${index}`,
  lastUpdatedAt: new Date().toISOString(), nextRefreshAt: new Date(Date.now() + 600000 + index * 60000).toISOString(),
  events: Array.from({length: 10}, (_, i) => ({
    providerMatchId: `${id}-${i}`, homeTeam: ['ARS','CHE','LIV','MCI','MUN','TOT','AVL','NEW','EVE','FUL'][i],
    awayTeam: ['RMA','BAR','INT','ACM','PSG','BAY','DOR','JUV','BEN','POR'][i],
    markets: [
      ...[['1X2', ['1','X','2']], ['DC', ['1X','12','X2']], ['BTS', ['GG','NG']]].map(([code, labels]) => ({code, selections: labels.map(name => ({name, odd: 2.35 + index}))})),
      ...['OU','HOME_OU','AWAY_OU'].flatMap(code => [1.5,2.5,3.5].map(line => ({code, line, selections: ['OV','UN'].map(name => ({name, odd: 1.85}))}))),
      ...[1.5,2.5].map(line => ({code: `1X2_OU_${line}`, line, selections: ['1','X','2'].flatMap(result => ['OV','UN'].map(total => ({name: `${result}+${total}${line}`, odd: 3.25})))})),
    ],
  })),
});

for (const [width, height] of [[1600,900],[1920,1080]]) for (const zoom of [1,1.1]) {
  test(`${width}x${height} at ${Math.round(zoom * 100)}% desktop zoom geometry`, async ({browser}) => {
    // Desktop zoom reduces the CSS viewport and increases pixels per CSS pixel.
    // deviceScaleFactor alone would leave layout/media queries unchanged.
    const context = await browser.newContext({viewport: {width: Math.round(width / zoom), height: Math.round(height / zoom)}, deviceScaleFactor: zoom});
    const page = await context.newPage();
    let extraWeeks = false;
    await page.addInitScript(() => localStorage.setItem('virtualDisplayTerminalSession', JSON.stringify({accessToken: 'layout-test-only', terminal: {code: 'LAYOUT', name: 'Display'}})));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/virtual/')) {
        const id = url.searchParams.get('leagueId') || '21';
        const current = board(id);
        const data = url.pathname.endsWith('/leagues') ? [{provider: 'VirtualHorizon', leagueId: '21'}, {provider: 'VirtualHorizon', leagueId: '78'}]
          : url.pathname.endsWith('/queue') ? {currentBoard: current,
            nextBoards: Array.from({length: extraWeeks ? 29 : 4}, (_, index) => board(id, index + 1))} : current;
        return route.fulfill({json: data});
      }
      if (url.origin !== 'http://127.0.0.1:3107') return route.abort();
      return route.continue();
    });
    await page.goto('/');
    for (const league of ['Champions','EPL']) {
      await page.getByRole('button', {name: league, exact: true}).click();
      await expect(page.locator('.match-row')).toHaveCount(10);
      const id = league === 'Champions' ? '21' : '78';
      const weekTabs = page.getByRole('navigation', {name: 'Weeks'}).getByRole('button');
      await expect(weekTabs).toHaveText(weeks(id).map(week => `WEEK ${week}`));
      await expect(weekTabs.first()).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.odds-area .week-tabs')).toHaveCount(0);
      for (let index = 0; index < 5; index++) {
        await weekTabs.nth(index).click();
        await expect(weekTabs.nth(index)).toHaveAttribute('aria-pressed', 'true');
        await expect(weekTabs.nth(index)).toHaveCSS('border-bottom-color', 'rgb(224, 0, 0)');
        await expect(page.locator('.league-week')).toHaveText(`WEEK ${weeks(id)[index]}`);
        await expect(page.locator('.odd-button').first()).toHaveText((2.35 + index).toFixed(2));
        expect(await page.evaluate(() => document.querySelector('.match-row').getBoundingClientRect().top -
          document.querySelector('.market-labels').getBoundingClientRect().bottom)).toBe(0);
      }
      for (const market of ['MAIN','OVER / UNDER','HOME OV/UN','AWAY OV/UN','1X2 OV/UN 1.5','1X2 OV/UN 2.5']) {
        await page.getByRole('button', {name: market, exact: true}).click();
        const metrics = await page.evaluate(() => {
          const rect = el => {const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
          const header = document.querySelector('.market-labels');
          const rows = [...document.querySelectorAll('.match-row')];
          const tabs = [...document.querySelectorAll('.market-tab')];
          return {
            gap: rect(rows[0]).y - rect(header).bottom,
            lastBottom: rect(rows.at(-1)).bottom, footerTop: rect(document.querySelector('footer')).y,
            slipWidth: rect(document.querySelector('.bet-slip')).width,
            panelBottom: rect(document.querySelector('.league-panel')).bottom,
            headerBottom: rect(header).bottom,
            weeksFit: document.querySelector('.week-tabs').scrollWidth <= document.querySelector('.week-tabs').clientWidth,
            tabs: tabs.map(el => { const range = document.createRange(); range.selectNodeContents(el); return {label: el.textContent, box: rect(el), text: rect(range), scroll: el.scrollWidth, client: el.clientWidth}; }),
            navFits: tabs.every(el => {
              const range = document.createRange(); range.selectNodeContents(el);
              const box = rect(el); const text = rect(range);
              return text.x >= box.x && text.right <= box.right + 1 && text.y >= box.y && text.bottom <= box.bottom + 1 && el.scrollWidth <= el.clientWidth + 1;
            }),
            aligned: [...header.children].every((el, i) => {
              const price = rows[0].querySelectorAll('.odd-button')[i];
              return Math.abs(rect(el).x - rect(price).x) < 1 && Math.abs(rect(el).width - rect(price).width) < 1;
            }),
            rawQueue: /Event event-|Next: Week|next-21|next-78/.test(document.body.innerText),
          };
        });
        const prefix = `weeks-${width}x${height}-${Math.round(zoom*100)}-${league}-${market.replace(/[^a-z0-9]/gi,'_')}`;
        fs.mkdirSync('.tmp/layout-screenshots', {recursive:true});
        if (market === 'MAIN' || market === '1X2 OV/UN 2.5') await page.screenshot({path:path.join('.tmp/layout-screenshots', `${prefix}.png`)});
        fs.writeFileSync(path.join('.tmp/layout-screenshots', `${prefix}.json`), JSON.stringify(metrics, null, 2));
        if (!process.env.LAYOUT_CAPTURE) {
          expect(metrics.gap).toBeGreaterThanOrEqual(-1);
          expect(metrics.gap).toBeLessThanOrEqual(1);
          expect(metrics.lastBottom).toBeLessThanOrEqual(metrics.footerTop);
          expect(metrics.slipWidth).toBe(320);
          expect(Math.abs(metrics.panelBottom - metrics.headerBottom)).toBeLessThanOrEqual(1);
          expect(metrics.navFits).toBe(true);
          expect(metrics.weeksFit).toBe(true);
          expect(metrics.aligned).toBe(true);
          expect(metrics.rawQueue).toBe(false);
          await expect(page.getByRole('button', {name: league, exact: true})).toHaveCSS('border-bottom-color', 'rgb(224, 0, 0)');
          await expect(page.locator('.market-label')).toHaveCount(market === 'MAIN' ? 10 : market === 'OVER / UNDER' ? 4 : 6);
        }
      }
    }
    // Extra provider weeks remain outside the five-week window.
    extraWeeks = true;
    await page.reload();
    await expect(page.locator('.week-tab')).toHaveCount(5);
    expect(await page.locator('.week-tabs').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('.week-tab').last().click();
    await expect(page.locator('.week-tab').last()).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.querySelector('.match-row').getBoundingClientRect().top -
      document.querySelector('.market-labels').getBoundingClientRect().bottom)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await context.close();
  });
}

test('an upcoming board stays bettable at 00:16, closes at kickoff, and waits only when unavailable', async ({page}) => {
  const now = Date.now();
  let unavailable = false;
  await page.setViewportSize({width:1600,height:900});
  await page.clock.install({time:new Date(now)});
  await page.addInitScript(() => localStorage.setItem('virtualDisplayTerminalSession', JSON.stringify({accessToken:'layout-test-only',terminal:{code:'LAYOUT'}})));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/virtual/')) {
      const current = {...board('21'),state:'UPCOMING',scheduledStartAtUtc:new Date(now+16000).toISOString(),
        ...(unavailable ? {events:[],available:false,providerEventId:'unavailable'} : {})};
      return route.fulfill({json:url.pathname.endsWith('/queue') ? {currentBoard:current,nextBoards:[]} : current});
    }
    if (url.origin !== 'http://127.0.0.1:3107') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.timer-time')).toHaveText('00:16');
  await expect(page.locator('.odd-button').first()).toBeEnabled();
  await expect(page.locator('.betting-closed-message')).toHaveCount(0);
  await page.screenshot({path:'.tmp/layout-screenshots/upcoming-positive16.png'});
  await page.clock.runFor(16000);
  await expect(page.locator('.odd-button').first()).toBeDisabled();
  await expect(page.locator('.betting-closed-message')).toHaveText('Betting closed – games in progress');
  unavailable = true;
  await page.reload();
  await expect(page.locator('.betting-closed-message')).toHaveText('Waiting for the next virtual event');
});
