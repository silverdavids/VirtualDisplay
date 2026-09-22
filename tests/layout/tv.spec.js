const {test,expect}=require('@playwright/test');
const capture=require('../../src/tv/fixtures/real-feed.json');
const fs=require('node:fs');
const path=require('node:path');
test.use({viewport:{width:1920,height:1080}});
test.beforeEach(async({page})=>{
  await page.addInitScript(time=>{Date.now=()=>time;},Date.parse(capture.rest['21-queue'].receivedAt));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/virtual/')){
      const id=url.searchParams.get('leagueId');
      const item=capture.rest[`${id}-${url.pathname.endsWith('/queue')?'queue':'results'}`];
      return item ? route.fulfill({json:item.payload}) : route.abort();
    }
    if(url.origin!=='http://127.0.0.1:3107')return route.abort();
    return route.continue();
  });
});
test('TV entry has four channels and no cashier login requirement',async({page})=>{
  await page.goto('/tv');
  await expect(page.getByRole('heading',{name:'Choose your channel'})).toBeVisible();
  await expect(page.locator('.tv-channel-grid a')).toHaveCount(4);
  await page.locator('a[href^="/tv/78/correct-score"]').click();
  await expect(page.getByRole('table',{name:'Correct Score'})).toBeVisible();
  await expect(page).toHaveURL(/\/tv\/78\/correct-score/);
});
for(const id of ['21','78'])for(const view of ['standard','correct-score']){
  test(`${id} ${view}: captured API odds fill a read-only full-screen TV`,async({page})=>{
    await page.goto(`/tv/${id}/${view}?rotate=0`);
    const table=page.locator('.tv-odds-table');
    await expect(table.locator('tbody tr')).toHaveCount(10);
    await expect(page.locator('.bet-slip,.odd-button,input')).toHaveCount(0);
    await expect(page.getByLabel('Results ticker')).toBeVisible();
    const bounds=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,
      tableBottom:document.querySelector('.tv-odds-table').getBoundingClientRect().bottom,
      footerTop:document.querySelector('.tv-ticker').getBoundingClientRect().top}));
    expect(bounds.width).toBeLessThanOrEqual(1920);expect(bounds.height).toBeLessThanOrEqual(1080);
    expect(bounds.tableBottom).toBeLessThanOrEqual(bounds.footerTop);
    const directory=path.resolve('docs/screenshots');fs.mkdirSync(directory,{recursive:true});
    await page.screenshot({path:path.join(directory,`tv-${id}-${view}.png`),animations:'disabled'});
  });
}
