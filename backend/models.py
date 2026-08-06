from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    documents = relationship("Document", back_populates="owner")
    folders = relationship("Folder", back_populates="owner")
    annotations = relationship("Annotation", back_populates="owner")

class Folder(Base):
    __tablename__ = "folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="folders")
    documents = relationship("Document", back_populates="folder")
    subfolders = relationship("Folder", backref="parent", remote_side=[id])

class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, index=True) # UUID string matching chroma doc_id
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    title = Column(String, nullable=False)
    file_path = Column(String, nullable=False) # local path in uploads/ for MVP
    page_count = Column(Integer, default=1)
    chunks = Column(Integer, default=0)
    chars = Column(Integer, default=0)
    preview = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_opened_at = Column(DateTime(timezone=True), nullable=True)
    last_page_read = Column(Integer, default=1)

    owner = relationship("User", back_populates="documents")
    folder = relationship("Folder", back_populates="documents")
    annotations = relationship("Annotation", back_populates="document")
    chat_messages = relationship("ChatMessage", back_populates="document", cascade="all, delete-orphan")

class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(String, ForeignKey("documents.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    page_num = Column(Integer, nullable=False)
    text_content = Column(Text, nullable=False)
    comment = Column(Text, nullable=True)
    # Storing bounding box as JSON or simply comma separated string "x,y,w,h"
    bounding_box = Column(String, nullable=False)
    color = Column(String, default="yellow")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    document = relationship("Document", back_populates="annotations")
    owner = relationship("User", back_populates="annotations")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(String, ForeignKey("documents.id"), nullable=True)
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String, nullable=False) # 'user' or 'ai'
    text = Column(Text, nullable=False)
    sources = Column(Text, nullable=True) # JSON string of sources
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    document = relationship("Document", back_populates="chat_messages")
    folder = relationship("Folder", backref="chat_messages")
    owner = relationship("User")

class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)

    document = relationship("Document", backref="document_chunks")

