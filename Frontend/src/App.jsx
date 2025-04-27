// src/App.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  // Authentication states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  
  // Dashboard states
  const [activeTab, setActiveTab] = useState('feed');
  const [posts, setPosts] = useState([]);
  const [myPosts, setMyPosts] = useState([]);
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  // Check if user is already logged in on component mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchUserData(token);
    }
  }, []);

  // Fetch posts when user logs in or tab changes
  useEffect(() => {
    if (user) {
      if (activeTab === 'feed') {
        fetchPosts();
      } else if (activeTab === 'profile') {
        fetchMyPosts();
      }
    }
  }, [user, activeTab]);

  const fetchUserData = async (token) => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:8000/users/me/', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setUser(response.data);
      setError('');
    } catch (err) {
      localStorage.removeItem('token');
      setUser(null);
      setError('Session expired. Please login again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async () => {
    try {
      const response = await axios.get('http://localhost:8000/posts/');
      setPosts(response.data);
    } catch (err) {
      setError('Failed to fetch posts');
    }
  };

  const fetchMyPosts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:8000/posts/me/', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setMyPosts(response.data);
    } catch (err) {
      setError('Failed to fetch your posts');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(
        'http://localhost:8000/token',
        `username=${username}&password=${password}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      localStorage.setItem('token', response.data.access_token);
      await fetchUserData(response.data.access_token);
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('http://localhost:8000/register', {
        username,
        password,
        email,
        full_name: fullName,
      });

      // After successful registration, automatically login
      await handleLogin(e);
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setUsername('');
    setPassword('');
    setError('');
    setPosts([]);
    setMyPosts([]);
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:8000/posts/', {
        caption,
        image_url: imageUrl,
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setCaption('');
      setImageUrl('');
      fetchPosts();
      fetchMyPosts();
    } catch (err) {
      setError('Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      {user ? (
        <div className="dashboard">
          {/* Header */}
          <header className="header">
            <h1>Instagram Clone</h1>
            <div className="user-info">
              <span>Welcome, {user.username}</span>
              <button onClick={handleLogout} className="logout-btn">
                Logout
              </button>
            </div>
          </header>

          {/* Navigation */}
          <nav className="tabs">
            <button
              className={activeTab === 'feed' ? 'active' : ''}
              onClick={() => setActiveTab('feed')}
            >
              Feed
            </button>
            <button
              className={activeTab === 'profile' ? 'active' : ''}
              onClick={() => setActiveTab('profile')}
            >
              My Profile
            </button>
            <button
              className={activeTab === 'create' ? 'active' : ''}
              onClick={() => setActiveTab('create')}
            >
              Create Post
            </button>
          </nav>

          {/* Main Content */}
          <main className="content">
            {error && <div className="error">{error}</div>}

            {activeTab === 'feed' && (
              <div className="posts-container">
                <h2>Recent Posts</h2>
                {posts.length === 0 ? (
                  <p>No posts found. Be the first to post!</p>
                ) : (
                  posts.map((post) => (
                    <div key={post.id} className="post">
                      <div className="post-header">
                        <span className="username">{post.owner_username}</span>
                      </div>
                      <img src={post.image_url} alt={post.caption} className="post-image" />
                      <div className="post-caption">{post.caption}</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="profile-container">
                <div className="profile-header">
                  <h2>{user.full_name || user.username}</h2>
                  <p>{user.email}</p>
                </div>
                <div className="my-posts">
                  <h3>My Posts</h3>
                  {myPosts.length === 0 ? (
                    <p>You haven't posted anything yet.</p>
                  ) : (
                    <div className="posts-grid">
                      {myPosts.map((post) => (
                        <div key={post.id} className="post-thumbnail">
                          <img src={post.image_url} alt={post.caption} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'create' && (
              <div className="create-post">
                <h2>Create New Post</h2>
                <form onSubmit={handleCreatePost}>
                  <div className="form-group">
                    <label>Image URL</label>
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="Enter image URL"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Caption</label>
                    <textarea
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="What's on your mind?"
                      required
                    />
                  </div>
                  <button type="submit" disabled={loading}>
                    {loading ? 'Posting...' : 'Share Post'}
                  </button>
                </form>
              </div>
            )}
          </main>
        </div>
      ) : (
        <div className="auth-container">
          <h1>Instagram Clone</h1>
          
          <div className="auth-tabs">
            <button 
              onClick={() => setIsLogin(true)} 
              className={isLogin ? 'active' : ''}
            >
              Login
            </button>
            <button 
              onClick={() => setIsLogin(false)} 
              className={!isLogin ? 'active' : ''}
            >
              Register
            </button>
          </div>

          {error && <div className="error">{error}</div>}

          {isLogin ? (
            <form onSubmit={handleLogin} className="auth-form">
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="auth-form">
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Registering...' : 'Register'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default App;