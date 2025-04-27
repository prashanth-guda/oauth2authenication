from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
import os
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from bson import ObjectId



# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
MONGO_DB_URL = os.getenv("MONGO_DB_URL", "mongodb://localhost:27017")
MONGO_DB_NAME = "oauth_db"

# MongoDB setup
client = AsyncIOMotorClient(MONGO_DB_URL)
db = client[MONGO_DB_NAME]
users_collection = db["users"]

# Models
class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserInDB(UserBase):
    hashed_password: str
    disabled: bool = False

class UserOut(UserBase):
    disabled: bool

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None


class PostBase(BaseModel):
    caption: str
    image_url: str

class PostCreate(PostBase):
    pass

class Post(PostBase):
    id: str
    owner_username: str
    created_at: datetime


# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # React's default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper functions
def verify_password(plain_password: str, hashed_password: str):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str):
    return pwd_context.hash(password)

async def get_user(username: str):
    user_dict = await users_collection.find_one({"username": username})
    if user_dict:
        return UserInDB(**user_dict)

async def authenticate_user(username: str, password: str):
    user = await get_user(username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    user = await get_user(username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: UserInDB = Depends(get_current_user)):
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

# Initialize MongoDB indexes
async def create_indexes():
    await users_collection.create_index("username", unique=True)
    await users_collection.create_index("email", unique=True)

@app.on_event("startup")
async def startup_db_client():
    await create_indexes()
    # Create a test user if none exists
    if await users_collection.count_documents({}) == 0:
        test_user = {
            "username": "johndoe",
            "email": "johndoe@example.com",
            "full_name": "John Doe",
            "hashed_password": get_password_hash("secret"),
            "disabled": False
        }
        try:
            await users_collection.insert_one(test_user)
        except DuplicateKeyError:
            pass

# Routes
@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/register", response_model=UserOut)
async def register_user(user: UserCreate):
    hashed_password = get_password_hash(user.password)
    user_dict = user.dict()
    user_dict["hashed_password"] = hashed_password
    user_dict["disabled"] = False
    del user_dict["password"]
    
    try:
        result = await users_collection.insert_one(user_dict)
        if result.inserted_id:
            return UserOut(**user_dict)
    except DuplicateKeyError as e:
        if "username" in str(e):
            raise HTTPException(status_code=400, detail="Username already registered")
        elif "email" in str(e):
            raise HTTPException(status_code=400, detail="Email already registered")
    raise HTTPException(status_code=400, detail="Registration failed")

@app.get("/users/me/", response_model=UserOut)
async def read_users_me(current_user: UserInDB = Depends(get_current_active_user)):
    return current_user

@app.get("/")
async def root():
    return {"message": "Hello World"}

class Config:
        json_encoders = {ObjectId: str}

# Add these endpoints
@app.post("/posts/", response_model=Post)
async def create_post(
    post: PostCreate,
    current_user: UserInDB = Depends(get_current_active_user)
):
    post_dict = post.dict()
    post_dict["owner_username"] = current_user.username
    post_dict["created_at"] = datetime.utcnow()
    
    result = await db.posts.insert_one(post_dict)
    created_post = await db.posts.find_one({"_id": result.inserted_id})
    created_post["id"] = str(created_post["_id"])
    return Post(**created_post)

@app.get("/posts/", response_model=List[Post])
async def read_posts(skip: int = 0, limit: int = 10):
    posts = []
    async for post in db.posts.find().sort("created_at", -1).skip(skip).limit(limit):
        post["id"] = str(post["_id"])
        posts.append(Post(**post))
    return posts

@app.get("/posts/me/", response_model=List[Post])
async def read_my_posts(current_user: UserInDB = Depends(get_current_active_user)):
    posts = []
    async for post in db.posts.find({"owner_username": current_user.username}).sort("created_at", -1):
        post["id"] = str(post["_id"])
        posts.append(Post(**post))
    return posts