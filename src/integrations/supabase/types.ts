export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      benchmarks: {
        Row: {
          currency: string | null
          date: string
          ingested_at: string
          series_id: string
          source: string
          value: number
        }
        Insert: {
          currency?: string | null
          date: string
          ingested_at?: string
          series_id: string
          source: string
          value: number
        }
        Update: {
          currency?: string | null
          date?: string
          ingested_at?: string
          series_id?: string
          source?: string
          value?: number
        }
        Relationships: []
      }
      family_beta: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      family_partners: {
        Row: {
          created_at: string
          owner_id: string
          partner_id: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          partner_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          partner_id?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          created_at: string
          currency: string
          date: string
          rate_to_base: number
        }
        Insert: {
          created_at?: string
          currency: string
          date: string
          rate_to_base: number
        }
        Update: {
          created_at?: string
          currency?: string
          date?: string
          rate_to_base?: number
        }
        Relationships: []
      }
      portfolio_invites: {
        Row: {
          consumed_at: string | null
          consumed_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          invitee_email: string
          key_epoch: number
          portfolio_id: string
          wrapped_pk_invite: string | null
        }
        Insert: {
          consumed_at?: string | null
          consumed_by?: string | null
          created_at?: string
          created_by: string
          expires_at?: string
          id: string
          invitee_email: string
          key_epoch: number
          portfolio_id: string
          wrapped_pk_invite?: string | null
        }
        Update: {
          consumed_at?: string | null
          consumed_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          invitee_email?: string
          key_epoch?: number
          portfolio_id?: string
          wrapped_pk_invite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_invites_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_key_history: {
        Row: {
          key_epoch: number
          portfolio_id: string
          user_id: string
          wrapped_pk: string
        }
        Insert: {
          key_epoch: number
          portfolio_id: string
          user_id: string
          wrapped_pk: string
        }
        Update: {
          key_epoch?: number
          portfolio_id?: string
          user_id?: string
          wrapped_pk?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_key_history_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_members: {
        Row: {
          created_at: string
          key_epoch: number
          portfolio_id: string
          user_id: string
          wrapped_pk: string
        }
        Insert: {
          created_at?: string
          key_epoch: number
          portfolio_id: string
          user_id: string
          wrapped_pk: string
        }
        Update: {
          created_at?: string
          key_epoch?: number
          portfolio_id?: string
          user_id?: string
          wrapped_pk?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_members_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_revisions: {
        Row: {
          enc_version: number
          encrypted_data: string
          key_epoch: number
          nonce: string
          portfolio_id: string
          revision: number
          saved_at: string
          saved_by: string | null
        }
        Insert: {
          enc_version: number
          encrypted_data: string
          key_epoch: number
          nonce: string
          portfolio_id: string
          revision: number
          saved_at: string
          saved_by?: string | null
        }
        Update: {
          enc_version?: number
          encrypted_data?: string
          key_epoch?: number
          nonce?: string
          portfolio_id?: string
          revision?: number
          saved_at?: string
          saved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_revisions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_snapshots: {
        Row: {
          data: Json | null
          enc_version: number
          encrypted_data: string | null
          id: string
          nonce: string | null
          updated_at: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          data?: Json | null
          enc_version?: number
          encrypted_data?: string | null
          id?: string
          nonce?: string | null
          updated_at?: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          data?: Json | null
          enc_version?: number
          encrypted_data?: string | null
          id?: string
          nonce?: string | null
          updated_at?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolios: {
        Row: {
          created_at: string
          enc_version: number
          encrypted_data: string
          id: string
          key_epoch: number
          nonce: string
          owner_id: string
          revision: number
          rotation_due: boolean
          saved_at: string
          saved_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enc_version: number
          encrypted_data: string
          id: string
          key_epoch?: number
          nonce: string
          owner_id: string
          revision?: number
          rotation_due?: boolean
          saved_at?: string
          saved_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enc_version?: number
          encrypted_data?: string
          id?: string
          key_epoch?: number
          nonce?: string
          owner_id?: string
          revision?: number
          rotation_due?: boolean
          saved_at?: string
          saved_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auto_lock_minutes: number
          blur_on_unfocus: boolean
          created_at: string
          display_name: string | null
          id: string
          preferred_currency: string | null
          reminder_frequency: string
          reminder_last_sent_at: string | null
          user_id: string
        }
        Insert: {
          auto_lock_minutes?: number
          blur_on_unfocus?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          preferred_currency?: string | null
          reminder_frequency?: string | null
          reminder_last_sent_at?: string | null
          user_id: string
        }
        Update: {
          auto_lock_minutes?: number
          blur_on_unfocus?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          preferred_currency?: string | null
          reminder_frequency?: string | null
          reminder_last_sent_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          ip: string
          request_count: number
          window_start: string
        }
        Insert: {
          ip: string
          request_count?: number
          window_start?: string
        }
        Update: {
          ip?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_keys: {
        Row: {
          created_at: string
          enc_version: number
          kdf_salt: string
          recovery_kdf_salt: string | null
          updated_at: string
          user_id: string
          wrapped_dk_kek: string
          wrapped_dk_recovery: string | null
        }
        Insert: {
          created_at?: string
          enc_version?: number
          kdf_salt: string
          recovery_kdf_salt?: string | null
          updated_at?: string
          user_id: string
          wrapped_dk_kek: string
          wrapped_dk_recovery?: string | null
        }
        Update: {
          created_at?: string
          enc_version?: number
          kdf_salt?: string
          recovery_kdf_salt?: string | null
          updated_at?: string
          user_id?: string
          wrapped_dk_kek?: string
          wrapped_dk_recovery?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_portfolio_invite: {
        Args: { p_invite_id: string; p_wrapped_pk: string }
        Returns: string
      }
      create_portfolio: {
        Args: {
          p_enc_version: number
          p_encrypted_data: string
          p_id: string
          p_nonce: string
          p_wrapped_pk: string
        }
        Returns: undefined
      }
      create_portfolio_invite: {
        Args: {
          p_invite_id: string
          p_invitee_email: string
          p_key_epoch: number
          p_portfolio_id: string
          p_wrapped_pk: string
        }
        Returns: undefined
      }
      get_portfolio_invite: {
        Args: { p_invite_id: string }
        Returns: {
          expires_at: string | null
          invited_by: string | null
          key_epoch: number | null
          portfolio_id: string | null
          status: string
          wrapped_pk: string | null
        }[]
      }
      is_portfolio_member: {
        Args: { _portfolio_id: string }
        Returns: boolean
      }
      is_portfolio_owner: {
        Args: { _portfolio_id: string }
        Returns: boolean
      }
      list_portfolio_people: {
        Args: Record<PropertyKey, never>
        Returns: {
          email: string
          is_owner: boolean
          joined_at: string
          portfolio_id: string
          user_id: string
        }[]
      }
      release_owned_portfolios: {
        Args: { p_user_id: string }
        Returns: {
          deleted: number
          transferred: number
        }[]
      }
      rotate_portfolio_key: {
        Args: {
          p_enc_version: number
          p_encrypted_data: string
          p_expected_epoch: number
          p_expected_revision: number
          p_id: string
          p_nonce: string
          p_owner_wrapped_pk: string
        }
        Returns: {
          current_epoch: number | null
          current_revision: number | null
          status: string
        }[]
      }
      save_portfolio: {
        Args: {
          p_enc_version: number
          p_encrypted_data: string
          p_expected_revision: number
          p_id: string
          p_key_epoch: number
          p_nonce: string
        }
        Returns: {
          current_revision: number | null
          status: string
        }[]
      }
      check_rate_limit: {
        Args: {
          p_ip: string
          p_max_requests?: number
          p_window_seconds?: number
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _user_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      is_admin: {
        Args: {
          _user_id?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "moderator"],
    },
  },
} as const
