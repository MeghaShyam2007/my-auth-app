const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const router = express.Router();

/**
 * Generate cryptographically secure CSRF state
 */
function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * GET /auth/github
 * Redirects user to GitHub OAuth login screen
 */
router.get('/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback';

  if (!clientId || clientId === 'your_github_client_id') {
    return res.redirect('/?error=missing_credentials');
  }

  const state = generateState();
  req.session.oauth_state = state;

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'read:user user:email');
  authUrl.searchParams.set('state', state);

  return res.redirect(authUrl.toString());
});

/**
 * GET /auth/github/callback
 * Handles OAuth callback, validates state, and exchanges code for user profile
 */
router.get('/github/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('GitHub OAuth error:', error, error_description);
    return res.redirect(`/?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code || !state) {
    return res.redirect('/?error=missing_code_or_state');
  }

  // Strict CSRF State Validation
  const sessionState = req.session.oauth_state;
  if (!sessionState || sessionState !== state) {
    return res.redirect('/?error=state_mismatch_csrf_detected');
  }
  delete req.session.oauth_state;

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback';

  try {
    // 1. Exchange authorization code for access token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri
      },
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    const tokenData = tokenResponse.data;

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error_description || tokenData.error);
      return res.redirect(`/?error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
    }

    const accessToken = tokenData.access_token;

    // 2. Fetch authenticated GitHub user profile
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'GitHub-OAuth-App'
      }
    });

    const userData = userResponse.data;

    // 3. Fetch primary verified email
    let primaryEmail = userData.email;
    if (!primaryEmail) {
      try {
        const emailsResponse = await axios.get('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'GitHub-OAuth-App'
          }
        });
        const primary = emailsResponse.data.find(e => e.primary && e.verified) || emailsResponse.data[0];
        if (primary) primaryEmail = primary.email;
      } catch (emailErr) {
        console.warn('Could not fetch private emails:', emailErr.message);
      }
    }

    // 4. Store authenticated user session
    req.session.user = {
      id: userData.id,
      login: userData.login,
      name: userData.name || userData.login,
      email: primaryEmail || 'Not public',
      avatar_url: userData.avatar_url,
      bio: userData.bio || 'No bio provided',
      location: userData.location || 'Not specified',
      public_repos: userData.public_repos,
      followers: userData.followers,
      following: userData.following,
      html_url: userData.html_url,
      created_at: userData.created_at,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
      authenticated_at: new Date().toISOString()
    };

    return res.redirect('/dashboard');
  } catch (err) {
    console.error('Error during GitHub OAuth exchange:', err.response ? err.response.data : err.message);
    const msg = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
    return res.redirect(`/?error=${encodeURIComponent(msg)}`);
  }
});

/**
 * GET /auth/logout
 * Destroys user session
 */
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
