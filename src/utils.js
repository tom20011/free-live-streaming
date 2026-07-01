export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

export function extractCookies(res) {
  const cookies = [];
  res.headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') {
      const cookie = value.split(';')[0];
      if (cookie) cookies.push(cookie);
    }
  });
  return cookies.join('; ');
}
