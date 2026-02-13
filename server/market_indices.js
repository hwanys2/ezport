const MARKET_INDICES = [
  {
    slug: 'dow',
    symbol: '^DJI',
    label: '다우존스 산업지수',
    shortLabel: 'Dow Jones',
    region: '미국',
  },
  {
    slug: 'nasdaq',
    symbol: '^IXIC',
    label: '나스닥 종합지수',
    shortLabel: 'NASDAQ',
    region: '미국',
  },
  {
    slug: 'kospi',
    symbol: '^KS11',
    label: '코스피 지수',
    shortLabel: 'KOSPI',
    region: '대한민국',
  },
  {
    slug: 'kosdaq',
    symbol: '^KQ11',
    label: '코스닥 지수',
    shortLabel: 'KOSDAQ',
    region: '대한민국',
  },
];

module.exports = {
  MARKET_INDICES,
};
