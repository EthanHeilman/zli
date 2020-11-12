import { SessionState, TargetType } from "../types";


  export interface CreateSessionRequest {
    displayName?: string;
    connectionsToOpen: ConnectionsToOpen[];
  }
  
  export interface CreateSessionResponse {
    sessionId: string;
  }
  
  export interface CloseSessionRequest {
    sessionId: string;
  }
  
  export interface CloseSessionResponse {
  
  }
  
  export interface ListSessionsRequest {
  
  }
  
  export interface ListSessionsResponse {
    sessions: SessionDetails[];
  }
  
  export interface SessionDetails {
    id: string;
    displayName: string;
    timeCreated: number;
    state: SessionState,
    connections: ConnectionSummary[]
  }
  
  export interface ConnectionsToOpen {
      serverId: string;
      connectionType: TargetType,
      count: number
  }


  export enum ConnectionState {
    Open = "Open",
    Closed = "Closed",
    Error = "Error"
  }
  
  export interface CreateConnectionRequest {
    sessionId: string;
    serverId: string;
    serverType: TargetType;
  }
  
  export interface CreateConnectionResponse {
    connectionId: string;
  }
  
  
  export interface CloseConnectionRequest {
    connectionId: string;
  }
  
  export interface CloseConnectionResponse {
  }
  
  export interface ConnectionSummary {
    id: string;
    timeCreated: number;
    serverId: string;
    sessionId: string;
    state: ConnectionState,
    serverType: TargetType
  }