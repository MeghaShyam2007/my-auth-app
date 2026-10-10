const express = require('express');
const session = require('express-session');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fallback_session_secret_12345',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if running over HTTPS in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

// Mount Auth routes
app.use('/auth', authRouter);

// Frontend Pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  // If not authenticated, redirect to login
  if (!req.session || !req.session.user) {
    return res.redirect('/?error=unauthorized');
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Current User API
app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ authenticated: true, user: req.session.user });
  }
  return res.json({ authenticated: false, user: null });
});

// App configuration status API
app.get('/api/status', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID || '';
  const isPlaceholder = !clientId || clientId === 'your_github_client_id';

  res.json({
    isConfigured: !isPlaceholder,
    callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback',
    clientIdPreview: !isPlaceholder ? `${clientId.substring(0, 4)}••••` : 'Not set'
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`GitHub Callback URL: ${process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback'}`);
});
