import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('http://localhost:5173/dashboard', {waitUntil: 'networkidle2'});
  await new Promise(r => setTimeout(r, 4000));
  
  await page.screenshot({path: 'dashboard_error.png'});
  console.log("Screenshot saved.");
  
  await browser.close();
})();
