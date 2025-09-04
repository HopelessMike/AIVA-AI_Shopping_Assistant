// src/hooks/useWebSocket.js - WebSocket Connection Hook

import { useState, useEffect, useRef, useCallback } from 'react';

export const useWebSocket = (url, options = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const messageQueueRef = useRef([]);
  
  const {
    reconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    onOpen,
    onMessage,
    onError,
    onClose
  } = options;
  
  const reconnectAttemptsRef = useRef(0);
  
  const connect = useCallback(() => {
    try {
      const socket = new WebSocket(url);
      
      socket.onopen = (event) => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // Send queued messages
        while (messageQueueRef.current.length > 0) {
          const message = messageQueueRef.current.shift();
          socket.send(message);
        }
        
        if (onOpen) onOpen(event);
      };
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          if (onMessage) onMessage(data);
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };
      
      socket.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error');
        if (onError) onError(event);
      };
      
      socket.onclose = (event) => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        socketRef.current = null;
        
        if (onClose) onClose(event);
        
        // Attempt reconnection
        if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
        }
      };
      
      socketRef.current = socket;
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to connect');
    }
  }, [url, reconnect, reconnectInterval, maxReconnectAttempts, onOpen, onMessage, onError, onClose]);
  
  const sendMessage = useCallback((data) => {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(message);
    } else {
      // Queue message if not connected
      console.log('WebSocket not connected, queueing message');
      messageQueueRef.current.push(message);
    }
  }, []);
  
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (socketRef.current) {
      socketRef.current.close();
    }
  }, []);
  
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, []);
  
  return {
    isConnected,
    sendMessage,
    lastMessage,
    error,
    disconnect,
    reconnect: connect
  };
};