// ============================================================
// 数据存储管理 - localStorage 封装
// 文章和图片的 CRUD 操作
// ============================================================

const Storage = {
  // 初始化默认数据
  init() {
    if (!localStorage.getItem('posts')) {
      const defaultPosts = [
        {
          id: 1,
          title: '欢迎来到我的个人空间',
          summary: '这是我的第一篇博客文章，记录了我搭建这个个人空间的初衷和想法。',
          content: `## 你好，世界！\n\n欢迎来到我的个人空间！这里是我记录生活、分享想法的地方。\n\n### 关于这个网站\n\n这个网站是我亲手搭建的，采用了纯静态技术栈，所有数据都存储在浏览器本地。\n\n### 我会分享什么\n\n- **技术笔记**：日常学习中的收获\n- **生活随笔**：旅行、美食、读书\n- **摄影作品**：随手拍下的美好瞬间\n\n希望你能在这里找到感兴趣的内容！`,
          cover: '',
          tags: ['随笔', '公告'],
          createdAt: new Date().toISOString(),
          views: 128
        }
      ];
      localStorage.setItem('posts', JSON.stringify(defaultPosts));
    }

    if (!localStorage.getItem('photos')) {
      const defaultPhotos = [];
      localStorage.setItem('photos', JSON.stringify(defaultPhotos));
    }

    if (!localStorage.getItem('siteConfig')) {
      const defaultConfig = {
        siteName: '我的个人空间',
        avatar: '',
        bio: '热爱生活，热爱技术，记录成长的点滴。',
        socialLinks: {
          github: '',
          twitter: '',
          email: ''
        }
      };
      localStorage.setItem('siteConfig', JSON.stringify(defaultConfig));
    }
  },

  // ========== 文章操作 ==========
  getPosts() {
    return JSON.parse(localStorage.getItem('posts') || '[]');
  },

  getPost(id) {
    const posts = this.getPosts();
    return posts.find(p => p.id === id);
  },

  savePost(post) {
    const posts = this.getPosts();
    if (post.id) {
      const index = posts.findIndex(p => p.id === post.id);
      if (index >= 0) {
        posts[index] = { ...posts[index], ...post, updatedAt: new Date().toISOString() };
      }
    } else {
      post.id = Date.now();
      post.createdAt = new Date().toISOString();
      post.views = 0;
      posts.unshift(post);
    }
    localStorage.setItem('posts', JSON.stringify(posts));
    return post;
  },

  deletePost(id) {
    const posts = this.getPosts().filter(p => p.id !== id);
    localStorage.setItem('posts', JSON.stringify(posts));
  },

  incrementViews(id) {
    const posts = this.getPosts();
    const index = posts.findIndex(p => p.id === id);
    if (index >= 0) {
      posts[index].views = (posts[index].views || 0) + 1;
      localStorage.setItem('posts', JSON.stringify(posts));
    }
  },

  // ========== 图片操作 ==========
  getPhotos() {
    return JSON.parse(localStorage.getItem('photos') || '[]');
  },

  savePhoto(photo) {
    const photos = this.getPhotos();
    photo.id = Date.now();
    photo.createdAt = new Date().toISOString();
    photos.unshift(photo);
    localStorage.setItem('photos', JSON.stringify(photos));
    return photo;
  },

  deletePhoto(id) {
    const photos = this.getPhotos().filter(p => p.id !== id);
    localStorage.setItem('photos', JSON.stringify(photos));
  },

  // ========== 站点配置 ==========
  getSiteConfig() {
    return JSON.parse(localStorage.getItem('siteConfig') || '{}');
  },

  saveSiteConfig(config) {
    localStorage.setItem('siteConfig', JSON.stringify(config));
  },

  // ========== 工具方法 ==========
  clearAll() {
    localStorage.removeItem('posts');
    localStorage.removeItem('photos');
    localStorage.removeItem('siteConfig');
    this.init();
  }
};

// 初始化
Storage.init();
