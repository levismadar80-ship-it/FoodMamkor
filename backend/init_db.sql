-- Initialize MeHaMakor database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Producers
CREATE TABLE IF NOT EXISTS producers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    city VARCHAR(100),
    lat FLOAT,
    lng FLOAT,
    location GEOMETRY(POINT, 4326),
    phone VARCHAR(20),
    instagram VARCHAR(100),
    website VARCHAR(200),
    status VARCHAR(20) DEFAULT 'pending',
    images TEXT[] DEFAULT '{}',
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(200) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    city VARCHAR(100),
    role VARCHAR(20) DEFAULT 'consumer',
    producer_id UUID REFERENCES producers(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    emoji VARCHAR(10)
);

-- Producer-Category junction
CREATE TABLE IF NOT EXISTS producer_categories (
    producer_id UUID REFERENCES producers(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (producer_id, category_id)
);

-- Products
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producer_id UUID REFERENCES producers(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price_range VARCHAR(50)
);

-- Delivery areas
CREATE TABLE IF NOT EXISTS delivery_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producer_id UUID REFERENCES producers(id) ON DELETE CASCADE NOT NULL,
    city VARCHAR(100) NOT NULL,
    min_order INTEGER,
    delivery_day VARCHAR(50)
);

-- Favorites
CREATE TABLE IF NOT EXISTS favorites (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    producer_id UUID REFERENCES producers(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, producer_id)
);

-- Recipes
CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(300) NOT NULL,
    description TEXT,
    steps JSON,
    category_id INTEGER REFERENCES categories(id),
    submitted_by UUID REFERENCES users(id) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Recipe ingredients
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,
    ingredient_name VARCHAR(200) NOT NULL,
    producer_id UUID REFERENCES producers(id),
    notes TEXT
);

-- Events & Experiences (v1)
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(300) NOT NULL,
    description TEXT NOT NULL,
    images TEXT[] DEFAULT '{}',
    category VARCHAR(50),
    type VARCHAR(20) NOT NULL DEFAULT 'event',
    host_type VARCHAR(20) NOT NULL DEFAULT 'community',
    location_type VARCHAR(20) NOT NULL DEFAULT 'public',
    host_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    producer_id UUID REFERENCES producers(id) ON DELETE SET NULL,
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_schedule TEXT,
    city VARCHAR(100),
    address VARCHAR(300),
    lat FLOAT,
    lng FLOAT,
    max_participants INTEGER,
    participants_count INTEGER DEFAULT 0,
    price_per_person NUMERIC(10, 2),
    requirements TEXT,
    status VARCHAR(30) DEFAULT 'pending',
    rejection_reason TEXT,
    admin_feedback TEXT,
    moderation_flags JSON,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_producers_status ON producers(status);
CREATE INDEX IF NOT EXISTS idx_producers_lat_lng ON producers(lat, lng);
CREATE INDEX IF NOT EXISTS idx_delivery_areas_city ON delivery_areas(city);
CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_city ON events(city);
