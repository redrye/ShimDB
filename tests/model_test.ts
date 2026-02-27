import { DB, Model } from '../src/ShimDB';

// 1. Define your Models
class User extends Model {
  name!: string;
  email!: string;
  age!: number;
}

class Post extends Model {
  title!: string;
  body!: string;
}

// 2. Initialize DB & Run Migrations
async function setupDatabase() {
  await DB.connect('my_laravel_app', 1, {
    // Schema::create('users', ...)
    users: (table) => {
      table.string('name');
      table.unique('email');
      table.integer('age');
    },
    // Schema::create('posts', ...)
    posts: (table) => {
      table.string('title');
      table.string('body');
    }
  });
}

// 3. Eloquent API Usage
async function run() {
  await setupDatabase();

  // Create (Insert)
  const user = await User.create({
    name: 'Taylor Otwell',
    email: 'taylor@laravel.com',
    age: 38
  });
  console.log('Created User ID:', user.id);

  // Active Record Pattern (Save/Update)
  // @ts-ignore
  const newPost = new Post({ title: 'IndexedDB is awesome', body: '...' });
  await newPost.save();

  user.age = 39;
  await user.save(); // Updates the user in IndexedDB

  // Query Builder (Where Clauses)
  const matureUsers = await User.where('age', '>=', 18)
    .where('name', 'Taylor Otwell')
    .get();

  console.log('Mature Users:', matureUsers);

  // Find by ID
  const foundUser = await User.find(1);

  // First or null
  // @ts-ignore
  const firstPost = await Post.query().first();

  // Delete
  if (foundUser) {
    await foundUser.delete();
  }

  // Mass Delete
  await User.where('age', '<', 18).delete();
}

run();