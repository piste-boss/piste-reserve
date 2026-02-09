-- Create Holidays Table
CREATE TABLE holidays (
  date DATE PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Menus Table
CREATE TABLE menus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  duration INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert Default Menus
INSERT INTO menus (id, label, duration) VALUES
  ('personal-20', 'パーソナルトレーニング', 20),
  ('trial-60', '無料体験', 60),
  ('entry-30', '入会手続き', 30),
  ('online-30', 'オンライン', 30),
  ('first-60', '初回パーソナル', 60);

-- Note: 'profiles' and 'reservations' tables are assumed to exist.
