const portal = ['admin', 'kitchen', 'staff'].includes(new URLSearchParams(location.search).get('portal')) ? new URLSearchParams(location.search).get('portal') : 'admin';
document.getElementById('portalName').textContent = `${portal === 'admin' ? 'Restaurant management' : portal === 'kitchen' ? 'Kitchen' : 'Floor staff'} access`;
document.getElementById('signIn').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.target.querySelector('button'); button.disabled = true;
  try {
    const fields = new FormData(event.target);
    const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: fields.get('username'), password: fields.get('password'), portal }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    location.assign(result.redirect);
  } catch (error) { document.getElementById('loginError').textContent = error.message; }
  finally { button.disabled = false; }
});
