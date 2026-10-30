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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          action: Database["public"]["Enums"]["activity_action"]
          created_at: string | null
          details: Json | null
          file_id: string | null
          id: string
          org_id: string
          user_email: string
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["activity_action"]
          created_at?: string | null
          details?: Json | null
          file_id?: string | null
          id?: string
          org_id: string
          user_email: string
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["activity_action"]
          created_at?: string | null
          details?: Json | null
          file_id?: string | null
          id?: string
          org_id?: string
          user_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_recovery_code: {
        Row: {
          code_hash: string
          created_at: string | null
          created_by: string
          description: string | null
          expires_at: string
          id: string
          is_revoked: boolean | null
          is_used: boolean | null
          org_id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          used_at: string | null
          used_by: string | null
          used_from_ip: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string | null
          created_by: string
          description?: string | null
          expires_at: string
          id?: string
          is_revoked?: boolean | null
          is_used?: boolean | null
          org_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          used_at?: string | null
          used_by?: string | null
          used_from_ip?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          expires_at?: string
          id?: string
          is_revoked?: boolean | null
          is_used?: boolean | null
          org_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          used_at?: string | null
          used_by?: string | null
          used_from_ip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_recovery_code_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_recovery_code_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_recovery_code_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_recovery_code_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      app_user: {
        Row: {
          avatar_url: string | null
          column_defaults: Json | null
          created_at: string | null
          custom_avatar_url: string | null
          email: string
          full_name: string | null
          id: string
          job_title: string | null
          last_online_at: string | null
          last_sign_in_at: string | null
          org_id: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          avatar_url?: string | null
          column_defaults?: Json | null
          created_at?: string | null
          custom_avatar_url?: string | null
          email: string
          full_name?: string | null
          id: string
          job_title?: string | null
          last_online_at?: string | null
          last_sign_in_at?: string | null
          org_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          avatar_url?: string | null
          column_defaults?: Json | null
          created_at?: string | null
          custom_avatar_url?: string | null
          email?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          last_online_at?: string | null
          last_sign_in_at?: string | null
          org_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "app_user_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_config: {
        Row: {
          access_key_encrypted: string | null
          backup_requested_at: string | null
          backup_requested_by: string | null
          backup_started_at: string | null
          bucket: string | null
          created_at: string | null
          designated_machine_id: string | null
          designated_machine_last_seen_at: string | null
          designated_machine_name: string | null
          designated_machine_platform: string | null
          designated_machine_user_email: string | null
          endpoint: string | null
          id: string
          is_schedule_enabled: boolean | null
          org_id: string
          provider: string
          region: string | null
          restic_password_encrypted: string | null
          retention_daily: number | null
          retention_monthly: number | null
          retention_weekly: number | null
          retention_yearly: number | null
          schedule_cron: string | null
          schedule_hour: number | null
          schedule_minute: number | null
          schedule_timezone: string | null
          secret_key_encrypted: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          access_key_encrypted?: string | null
          backup_requested_at?: string | null
          backup_requested_by?: string | null
          backup_started_at?: string | null
          bucket?: string | null
          created_at?: string | null
          designated_machine_id?: string | null
          designated_machine_last_seen_at?: string | null
          designated_machine_name?: string | null
          designated_machine_platform?: string | null
          designated_machine_user_email?: string | null
          endpoint?: string | null
          id?: string
          is_schedule_enabled?: boolean | null
          org_id: string
          provider?: string
          region?: string | null
          restic_password_encrypted?: string | null
          retention_daily?: number | null
          retention_monthly?: number | null
          retention_weekly?: number | null
          retention_yearly?: number | null
          schedule_cron?: string | null
          schedule_hour?: number | null
          schedule_minute?: number | null
          schedule_timezone?: string | null
          secret_key_encrypted?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          access_key_encrypted?: string | null
          backup_requested_at?: string | null
          backup_requested_by?: string | null
          backup_started_at?: string | null
          bucket?: string | null
          created_at?: string | null
          designated_machine_id?: string | null
          designated_machine_last_seen_at?: string | null
          designated_machine_name?: string | null
          designated_machine_platform?: string | null
          designated_machine_user_email?: string | null
          endpoint?: string | null
          id?: string
          is_schedule_enabled?: boolean | null
          org_id?: string
          provider?: string
          region?: string | null
          restic_password_encrypted?: string | null
          retention_daily?: number | null
          retention_monthly?: number | null
          retention_weekly?: number | null
          retention_yearly?: number | null
          schedule_cron?: string | null
          schedule_hour?: number | null
          schedule_minute?: number | null
          schedule_timezone?: string | null
          secret_key_encrypted?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_history: {
        Row: {
          bytes_added: number | null
          bytes_total: number | null
          completed_at: string | null
          created_at: string | null
          duration_seconds: number | null
          error_details: Json | null
          error_message: string | null
          files_added: number | null
          files_modified: number | null
          files_total: number | null
          id: string
          machine_id: string
          machine_name: string
          org_id: string
          snapshot_id: string | null
          started_at: string
          status: string
        }
        Insert: {
          bytes_added?: number | null
          bytes_total?: number | null
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error_details?: Json | null
          error_message?: string | null
          files_added?: number | null
          files_modified?: number | null
          files_total?: number | null
          id?: string
          machine_id: string
          machine_name: string
          org_id: string
          snapshot_id?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          bytes_added?: number | null
          bytes_total?: number | null
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error_details?: Json | null
          error_message?: string | null
          files_added?: number | null
          files_modified?: number | null
          files_total?: number | null
          id?: string
          machine_id?: string
          machine_name?: string
          org_id?: string
          snapshot_id?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_lock: {
        Row: {
          backup_history_id: string | null
          expires_at: string
          id: string
          locked_at: string
          locked_by_machine_id: string
          locked_by_machine_name: string
          org_id: string
        }
        Insert: {
          backup_history_id?: string | null
          expires_at: string
          id?: string
          locked_at?: string
          locked_by_machine_id: string
          locked_by_machine_name: string
          org_id: string
        }
        Update: {
          backup_history_id?: string | null
          expires_at?: string
          id?: string
          locked_at?: string
          locked_by_machine_id?: string
          locked_by_machine_name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_lock_backup_history_id_fkey"
            columns: ["backup_history_id"]
            isOneToOne: false
            referencedRelation: "backup_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_lock_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_machine: {
        Row: {
          app_version: string | null
          created_at: string | null
          id: string
          is_designated: boolean | null
          last_seen_at: string
          machine_id: string
          machine_name: string
          org_id: string
          platform: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string | null
          id?: string
          is_designated?: boolean | null
          last_seen_at?: string
          machine_id: string
          machine_name: string
          org_id: string
          platform?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string | null
          id?: string
          is_designated?: boolean | null
          last_seen_at?: string
          machine_id?: string
          machine_name?: string
          org_id?: string
          platform?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_machine_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_machine_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_user: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          email: string
          id: string
          org_id: string
          reason: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          email: string
          id?: string
          org_id: string
          reason?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          email?: string
          id?: string
          org_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_user_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_user_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      color_swatch: {
        Row: {
          color: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string | null
          org_id: string | null
          sort_order: number | null
          user_id: string | null
        }
        Insert: {
          color: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string | null
          org_id?: string | null
          sort_order?: number | null
          user_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string | null
          org_id?: string | null
          sort_order?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "color_swatch_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "color_swatch_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "color_swatch_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_accounts: {
        Row: {
          account_key: string
          channel: string
          channel_set_at: string | null
          channel_set_by: string | null
          channel_source: string | null
          created_at: string | null
          created_by: string | null
          display_name: string | null
          id: string
          kind: string | null
          org_id: string
          primary_country: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_key: string
          channel?: string
          channel_set_at?: string | null
          channel_set_by?: string | null
          channel_source?: string | null
          created_at?: string | null
          created_by?: string | null
          display_name?: string | null
          id?: string
          kind?: string | null
          org_id: string
          primary_country?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_key?: string
          channel?: string
          channel_set_at?: string | null
          channel_set_by?: string | null
          channel_source?: string | null
          created_at?: string | null
          created_by?: string | null
          display_name?: string | null
          id?: string
          kind?: string | null
          org_id?: string
          primary_country?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_accounts_channel_set_by_fkey"
            columns: ["channel_set_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_accounts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          erp_id: string | null
          id: string
          name: string | null
          org_id: string
          state: string | null
          street: string | null
          street2: string | null
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          erp_id?: string | null
          id?: string
          name?: string | null
          org_id: string
          state?: string | null
          street?: string | null
          street2?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          erp_id?: string | null
          id?: string
          name?: string | null
          org_id?: string
          state?: string | null
          street?: string | null
          street2?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_categories: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          org_id: string
          sort_order: number | null
          subcategory: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          org_id: string
          sort_order?: number | null
          subcategory?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          org_id?: string
          sort_order?: number | null
          subcategory?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_enrichment_run_items: {
        Row: {
          account_id: string
          attempts: number
          created_at: string | null
          error: string | null
          org_id: string
          run_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          attempts?: number
          created_at?: string | null
          error?: string | null
          org_id: string
          run_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          attempts?: number
          created_at?: string | null
          error?: string | null
          org_id?: string
          run_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_enrichment_run_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_enrichment_run_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_enrichment_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "customer_enrichment_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_enrichment_runs: {
        Row: {
          actual_cost_usd: number | null
          completed: number | null
          created_at: string | null
          created_by: string | null
          estimated_cost_usd: number | null
          failed: number | null
          finished_at: string | null
          id: string
          org_id: string
          skipped: number | null
          started_at: string | null
          status: string
          total_accounts: number | null
          updated_at: string | null
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          actual_cost_usd?: number | null
          completed?: number | null
          created_at?: string | null
          created_by?: string | null
          estimated_cost_usd?: number | null
          failed?: number | null
          finished_at?: string | null
          id?: string
          org_id: string
          skipped?: number | null
          started_at?: string | null
          status?: string
          total_accounts?: number | null
          updated_at?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          actual_cost_usd?: number | null
          completed?: number | null
          created_at?: string | null
          created_by?: string | null
          estimated_cost_usd?: number | null
          failed?: number | null
          finished_at?: string | null
          id?: string
          org_id?: string
          skipped?: number | null
          started_at?: string | null
          status?: string
          total_accounts?: number | null
          updated_at?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_enrichment_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_enrichment_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_enrichment_sources: {
        Row: {
          created_at: string | null
          enrichment_id: string
          id: string
          org_id: string
          quote: string | null
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          enrichment_id: string
          id?: string
          org_id: string
          quote?: string | null
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          enrichment_id?: string
          id?: string
          org_id?: string
          quote?: string | null
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_enrichment_sources_enrichment_id_fkey"
            columns: ["enrichment_id"]
            isOneToOne: false
            referencedRelation: "customer_enrichments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_enrichment_sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_enrichments: {
        Row: {
          account_id: string
          category: string | null
          confidence: number | null
          cost_usd: number | null
          created_at: string | null
          evidence_found: boolean
          id: string
          input_tokens: number | null
          is_current: boolean
          model: string | null
          needs_review: boolean | null
          org_id: string
          output_tokens: number | null
          prompt_version: string | null
          report: string | null
          researched_at: string | null
          researched_by: string | null
          subcategory: string | null
          updated_at: string | null
          web_searches: number | null
        }
        Insert: {
          account_id: string
          category?: string | null
          confidence?: number | null
          cost_usd?: number | null
          created_at?: string | null
          evidence_found?: boolean
          id?: string
          input_tokens?: number | null
          is_current?: boolean
          model?: string | null
          needs_review?: boolean | null
          org_id: string
          output_tokens?: number | null
          prompt_version?: string | null
          report?: string | null
          researched_at?: string | null
          researched_by?: string | null
          subcategory?: string | null
          updated_at?: string | null
          web_searches?: number | null
        }
        Update: {
          account_id?: string
          category?: string | null
          confidence?: number | null
          cost_usd?: number | null
          created_at?: string | null
          evidence_found?: boolean
          id?: string
          input_tokens?: number | null
          is_current?: boolean
          model?: string | null
          needs_review?: boolean | null
          org_id?: string
          output_tokens?: number | null
          prompt_version?: string | null
          report?: string | null
          researched_at?: string | null
          researched_by?: string | null
          subcategory?: string | null
          updated_at?: string | null
          web_searches?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_enrichments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_enrichments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_enrichments_researched_by_fkey"
            columns: ["researched_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_order_lines: {
        Row: {
          created_at: string | null
          discount: number | null
          id: string
          order_id: string
          org_id: string
          price_subtotal: number | null
          price_unit: number | null
          product_erp_id: string | null
          product_name: string | null
          quantity: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          discount?: number | null
          id?: string
          order_id: string
          org_id: string
          price_subtotal?: number | null
          price_unit?: number | null
          product_erp_id?: string | null
          product_name?: string | null
          quantity?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          discount?: number | null
          id?: string
          order_id?: string
          org_id?: string
          price_subtotal?: number | null
          price_unit?: number | null
          product_erp_id?: string | null
          product_name?: string | null
          quantity?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_lines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_orders: {
        Row: {
          contact_id: string | null
          created_at: string | null
          customer_id: string
          discount: number | null
          erp_id: string | null
          id: string
          items_count: number | null
          net: number | null
          note: string | null
          odoo_write_date: string | null
          order_date: string | null
          org_id: string
          payment_term: string | null
          shipping: number | null
          shipping_address_id: string | null
          shipping_method: string | null
          status: string | null
          tax: number | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          customer_id: string
          discount?: number | null
          erp_id?: string | null
          id?: string
          items_count?: number | null
          net?: number | null
          note?: string | null
          odoo_write_date?: string | null
          order_date?: string | null
          org_id: string
          payment_term?: string | null
          shipping?: number | null
          shipping_address_id?: string | null
          shipping_method?: string | null
          status?: string | null
          tax?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          customer_id?: string
          discount?: number | null
          erp_id?: string | null
          id?: string
          items_count?: number | null
          net?: number | null
          note?: string | null
          odoo_write_date?: string | null
          order_date?: string | null
          org_id?: string
          payment_term?: string | null
          shipping?: number | null
          shipping_address_id?: string | null
          shipping_method?: string | null
          status?: string | null
          tax?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_orders_shipping_address_id_fkey"
            columns: ["shipping_address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          account_id: string | null
          city: string | null
          company: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          erp_id: string | null
          erp_synced_at: string | null
          first_name: string | null
          first_order_date: string | null
          id: string
          industry: string | null
          is_active: boolean | null
          is_company: boolean | null
          item_count: number | null
          job_title: string | null
          last_name: string | null
          last_order_date: string | null
          name: string
          notes: string | null
          odoo_missing_since: string | null
          order_count: number | null
          org_id: string
          phone: string | null
          role: string | null
          state: string | null
          street: string | null
          street2: string | null
          total_spent: number | null
          updated_at: string | null
          updated_by: string | null
          vat: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          account_id?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          erp_id?: string | null
          erp_synced_at?: string | null
          first_name?: string | null
          first_order_date?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          is_company?: boolean | null
          item_count?: number | null
          job_title?: string | null
          last_name?: string | null
          last_order_date?: string | null
          name: string
          notes?: string | null
          odoo_missing_since?: string | null
          order_count?: number | null
          org_id: string
          phone?: string | null
          role?: string | null
          state?: string | null
          street?: string | null
          street2?: string | null
          total_spent?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vat?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          account_id?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          erp_id?: string | null
          erp_synced_at?: string | null
          first_name?: string | null
          first_order_date?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          is_company?: boolean | null
          item_count?: number | null
          job_title?: string | null
          last_name?: string | null
          last_order_date?: string | null
          name?: string
          notes?: string | null
          odoo_missing_since?: string | null
          order_count?: number | null
          org_id?: string
          phone?: string | null
          role?: string | null
          state?: string | null
          street?: string | null
          street2?: string | null
          total_spent?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vat?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      deviation: {
        Row: {
          affected_part_numbers: string[] | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string
          custom_properties: Json | null
          description: string | null
          deviation_number: string
          deviation_type: string | null
          effective_at: string | null
          expires_at: string | null
          id: string
          org_id: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["deviation_status"] | null
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          affected_part_numbers?: string[] | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by: string
          custom_properties?: Json | null
          description?: string | null
          deviation_number: string
          deviation_type?: string | null
          effective_at?: string | null
          expires_at?: string | null
          id?: string
          org_id: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["deviation_status"] | null
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          affected_part_numbers?: string[] | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string
          custom_properties?: Json | null
          description?: string | null
          deviation_number?: string
          deviation_type?: string | null
          effective_at?: string | null
          expires_at?: string | null
          id?: string
          org_id?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["deviation_status"] | null
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deviation_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deviation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deviation_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deviation_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_pdf_render: {
        Row: {
          file_id: string
          file_size: number
          file_version_id: string
          generated_at: string
          generated_by: string | null
          id: string
          is_closure_exact: boolean | null
          org_id: string
          storage_hash: string
        }
        Insert: {
          file_id: string
          file_size: number
          file_version_id: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          is_closure_exact?: boolean | null
          org_id: string
          storage_hash: string
        }
        Update: {
          file_id?: string
          file_size?: number
          file_version_id?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          is_closure_exact?: boolean | null
          org_id?: string
          storage_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_pdf_render_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_pdf_render_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_pdf_render_file_version_id_fkey"
            columns: ["file_version_id"]
            isOneToOne: true
            referencedRelation: "file_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_pdf_render_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_pdf_render_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      eco: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string
          custom_properties: Json | null
          description: string | null
          eco_number: string
          id: string
          org_id: string
          process_template_id: string | null
          status: Database["public"]["Enums"]["eco_status"] | null
          title: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          custom_properties?: Json | null
          description?: string | null
          eco_number: string
          id?: string
          org_id: string
          process_template_id?: string | null
          status?: Database["public"]["Enums"]["eco_status"] | null
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          custom_properties?: Json | null
          description?: string | null
          eco_number?: string
          id?: string
          org_id?: string
          process_template_id?: string | null
          status?: Database["public"]["Enums"]["eco_status"] | null
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eco_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_process_template_id_fkey"
            columns: ["process_template_id"]
            isOneToOne: false
            referencedRelation: "process_template"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      eco_checklist_activity: {
        Row: {
          action: string
          checklist_item_id: string | null
          eco_id: string
          gate_approval_id: string | null
          id: string
          new_value: string | null
          notes: string | null
          old_value: string | null
          performed_at: string | null
          performed_by: string | null
        }
        Insert: {
          action: string
          checklist_item_id?: string | null
          eco_id: string
          gate_approval_id?: string | null
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          performed_at?: string | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          checklist_item_id?: string | null
          eco_id?: string
          gate_approval_id?: string | null
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          performed_at?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eco_checklist_activity_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "eco_checklist_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_checklist_activity_eco_id_fkey"
            columns: ["eco_id"]
            isOneToOne: false
            referencedRelation: "eco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_checklist_activity_gate_approval_id_fkey"
            columns: ["gate_approval_id"]
            isOneToOne: false
            referencedRelation: "eco_gate_approval"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_checklist_activity_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      eco_checklist_item: {
        Row: {
          accountable_text: string | null
          accountable_user_id: string | null
          completed_at: string | null
          completed_by: string | null
          consulted_text: string | null
          consulted_user_ids: string[] | null
          created_at: string | null
          description: string | null
          doc_number: string | null
          eco_id: string
          gate_name: string | null
          id: string
          informed_text: string | null
          informed_user_ids: string[] | null
          is_required_for_gate: boolean | null
          link_file_id: string | null
          link_url: string | null
          name: string
          notes: string | null
          phase_name: string
          phase_sort_order: number | null
          responsible_text: string | null
          responsible_user_id: string | null
          sort_order: number
          started_at: string | null
          status: Database["public"]["Enums"]["checklist_item_status"] | null
          target_date: string | null
          template_item_id: string | null
          uid: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          accountable_text?: string | null
          accountable_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          consulted_text?: string | null
          consulted_user_ids?: string[] | null
          created_at?: string | null
          description?: string | null
          doc_number?: string | null
          eco_id: string
          gate_name?: string | null
          id?: string
          informed_text?: string | null
          informed_user_ids?: string[] | null
          is_required_for_gate?: boolean | null
          link_file_id?: string | null
          link_url?: string | null
          name: string
          notes?: string | null
          phase_name: string
          phase_sort_order?: number | null
          responsible_text?: string | null
          responsible_user_id?: string | null
          sort_order?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["checklist_item_status"] | null
          target_date?: string | null
          template_item_id?: string | null
          uid?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          accountable_text?: string | null
          accountable_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          consulted_text?: string | null
          consulted_user_ids?: string[] | null
          created_at?: string | null
          description?: string | null
          doc_number?: string | null
          eco_id?: string
          gate_name?: string | null
          id?: string
          informed_text?: string | null
          informed_user_ids?: string[] | null
          is_required_for_gate?: boolean | null
          link_file_id?: string | null
          link_url?: string | null
          name?: string
          notes?: string | null
          phase_name?: string
          phase_sort_order?: number | null
          responsible_text?: string | null
          responsible_user_id?: string | null
          sort_order?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["checklist_item_status"] | null
          target_date?: string | null
          template_item_id?: string | null
          uid?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eco_checklist_item_accountable_user_id_fkey"
            columns: ["accountable_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_checklist_item_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_checklist_item_eco_id_fkey"
            columns: ["eco_id"]
            isOneToOne: false
            referencedRelation: "eco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_checklist_item_link_file_id_fkey"
            columns: ["link_file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_checklist_item_link_file_id_fkey"
            columns: ["link_file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_checklist_item_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_checklist_item_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "process_template_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_checklist_item_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      eco_gate_approval: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          eco_id: string
          gate_name: string
          id: string
          is_approved: boolean | null
          notes: string | null
          phase_name: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          eco_id: string
          gate_name: string
          id?: string
          is_approved?: boolean | null
          notes?: string | null
          phase_name?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          eco_id?: string
          gate_name?: string
          id?: string
          is_approved?: boolean | null
          notes?: string | null
          phase_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eco_gate_approval_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eco_gate_approval_eco_id_fkey"
            columns: ["eco_id"]
            isOneToOne: false
            referencedRelation: "eco"
            referencedColumns: ["id"]
          },
        ]
      }
      file: {
        Row: {
          checked_out_at: string | null
          checked_out_by: string | null
          checked_out_by_machine_id: string | null
          checked_out_by_machine_name: string | null
          checked_out_file_name: string | null
          checked_out_file_path: string | null
          configuration_revisions: Json | null
          content_hash: string | null
          created_at: string | null
          created_by: string
          custom_properties: Json | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          eco_tags: string[] | null
          extension: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: Database["public"]["Enums"]["file_type"]
          id: string
          inspection_hash: string | null
          lock_message: string | null
          org_id: string
          part_number: string | null
          revision: string
          state: string | null
          state_changed_at: string | null
          state_changed_by: string | null
          updated_at: string | null
          updated_by: string | null
          vault_id: string
          version: number
          workflow_state_id: string | null
        }
        Insert: {
          checked_out_at?: string | null
          checked_out_by?: string | null
          checked_out_by_machine_id?: string | null
          checked_out_by_machine_name?: string | null
          checked_out_file_name?: string | null
          checked_out_file_path?: string | null
          configuration_revisions?: Json | null
          content_hash?: string | null
          created_at?: string | null
          created_by: string
          custom_properties?: Json | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          eco_tags?: string[] | null
          extension: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: Database["public"]["Enums"]["file_type"]
          id?: string
          inspection_hash?: string | null
          lock_message?: string | null
          org_id: string
          part_number?: string | null
          revision?: string
          state?: string | null
          state_changed_at?: string | null
          state_changed_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vault_id: string
          version?: number
          workflow_state_id?: string | null
        }
        Update: {
          checked_out_at?: string | null
          checked_out_by?: string | null
          checked_out_by_machine_id?: string | null
          checked_out_by_machine_name?: string | null
          checked_out_file_name?: string | null
          checked_out_file_path?: string | null
          configuration_revisions?: Json | null
          content_hash?: string | null
          created_at?: string | null
          created_by?: string
          custom_properties?: Json | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          eco_tags?: string[] | null
          extension?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: Database["public"]["Enums"]["file_type"]
          id?: string
          inspection_hash?: string | null
          lock_message?: string | null
          org_id?: string
          part_number?: string | null
          revision?: string
          state?: string | null
          state_changed_at?: string | null
          state_changed_by?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vault_id?: string
          version?: number
          workflow_state_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_checked_out_by_fkey"
            columns: ["checked_out_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_state_changed_by_fkey"
            columns: ["state_changed_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_workflow_state_id_fkey"
            columns: ["workflow_state_id"]
            isOneToOne: false
            referencedRelation: "workflow_state"
            referencedColumns: ["id"]
          },
        ]
      }
      file_comment: {
        Row: {
          annotation_type: string | null
          comment: string
          created_at: string | null
          edited_at: string | null
          file_id: string
          file_version: number | null
          id: string
          is_resolved: boolean | null
          page_number: number | null
          parent_id: string | null
          position: Json | null
          resolved_at: string | null
          resolved_by: string | null
          review_id: string | null
          review_item_id: string | null
          review_round: number | null
          user_id: string
        }
        Insert: {
          annotation_type?: string | null
          comment: string
          created_at?: string | null
          edited_at?: string | null
          file_id: string
          file_version?: number | null
          id?: string
          is_resolved?: boolean | null
          page_number?: number | null
          parent_id?: string | null
          position?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          review_item_id?: string | null
          review_round?: number | null
          user_id: string
        }
        Update: {
          annotation_type?: string | null
          comment?: string
          created_at?: string | null
          edited_at?: string | null
          file_id?: string
          file_version?: number | null
          id?: string
          is_resolved?: boolean | null
          page_number?: number | null
          parent_id?: string | null
          position?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string | null
          review_item_id?: string | null
          review_round?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_comment_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comment_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comment_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "file_comment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comment_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comment_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comment_review_item_id_fkey"
            columns: ["review_item_id"]
            isOneToOne: false
            referencedRelation: "review_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comment_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      file_deviation: {
        Row: {
          created_at: string | null
          created_by: string
          deviation_id: string
          file_id: string
          file_revision: string | null
          file_version: number | null
          id: string
          notes: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          deviation_id: string
          file_id: string
          file_revision?: string | null
          file_version?: number | null
          id?: string
          notes?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          deviation_id?: string
          file_id?: string
          file_revision?: string | null
          file_version?: number | null
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_deviation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_deviation_deviation_id_fkey"
            columns: ["deviation_id"]
            isOneToOne: false
            referencedRelation: "deviation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_deviation_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_deviation_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      file_eco: {
        Row: {
          created_at: string | null
          created_by: string
          eco_id: string
          file_id: string
          id: string
          notes: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          eco_id: string
          file_id: string
          id?: string
          notes?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          eco_id?: string
          file_id?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_eco_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_eco_eco_id_fkey"
            columns: ["eco_id"]
            isOneToOne: false
            referencedRelation: "eco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_eco_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_eco_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      file_metadata_column: {
        Row: {
          created_at: string | null
          created_by: string | null
          data_type: Database["public"]["Enums"]["metadata_column_type"]
          default_value: string | null
          id: string
          is_required: boolean
          is_sortable: boolean
          is_visible: boolean
          label: string
          name: string
          org_id: string
          select_options: string[]
          sort_order: number
          updated_at: string | null
          updated_by: string | null
          width: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          data_type?: Database["public"]["Enums"]["metadata_column_type"]
          default_value?: string | null
          id?: string
          is_required?: boolean
          is_sortable?: boolean
          is_visible?: boolean
          label: string
          name: string
          org_id: string
          select_options?: string[]
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
          width?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          data_type?: Database["public"]["Enums"]["metadata_column_type"]
          default_value?: string | null
          id?: string
          is_required?: boolean
          is_sortable?: boolean
          is_visible?: boolean
          label?: string
          name?: string
          org_id?: string
          select_options?: string[]
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_metadata_column_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_metadata_column_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_metadata_column_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      file_reference: {
        Row: {
          child_file_id: string
          configuration: string | null
          created_at: string | null
          id: string
          org_id: string
          parent_file_id: string
          quantity: number | null
          reference_type: Database["public"]["Enums"]["reference_type"] | null
          updated_at: string | null
        }
        Insert: {
          child_file_id: string
          configuration?: string | null
          created_at?: string | null
          id?: string
          org_id: string
          parent_file_id: string
          quantity?: number | null
          reference_type?: Database["public"]["Enums"]["reference_type"] | null
          updated_at?: string | null
        }
        Update: {
          child_file_id?: string
          configuration?: string | null
          created_at?: string | null
          id?: string
          org_id?: string
          parent_file_id?: string
          quantity?: number | null
          reference_type?: Database["public"]["Enums"]["reference_type"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_reference_child_file_id_fkey"
            columns: ["child_file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_reference_child_file_id_fkey"
            columns: ["child_file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_reference_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_reference_parent_file_id_fkey"
            columns: ["parent_file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_reference_parent_file_id_fkey"
            columns: ["parent_file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      file_share_link: {
        Row: {
          can_download: boolean | null
          created_at: string | null
          created_by: string
          download_count: number | null
          expires_at: string | null
          file_id: string
          file_version: number | null
          id: string
          is_active: boolean | null
          is_auth_required: boolean | null
          last_accessed_at: string | null
          max_downloads: number | null
          org_id: string
          password_hash: string | null
          token: string
        }
        Insert: {
          can_download?: boolean | null
          created_at?: string | null
          created_by: string
          download_count?: number | null
          expires_at?: string | null
          file_id: string
          file_version?: number | null
          id?: string
          is_active?: boolean | null
          is_auth_required?: boolean | null
          last_accessed_at?: string | null
          max_downloads?: number | null
          org_id: string
          password_hash?: string | null
          token: string
        }
        Update: {
          can_download?: boolean | null
          created_at?: string | null
          created_by?: string
          download_count?: number | null
          expires_at?: string | null
          file_id?: string
          file_version?: number | null
          id?: string
          is_active?: boolean | null
          is_auth_required?: boolean | null
          last_accessed_at?: string | null
          max_downloads?: number | null
          org_id?: string
          password_hash?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_share_link_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_share_link_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_share_link_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_share_link_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      file_state_entry: {
        Row: {
          duration_seconds: number | null
          entered_at: string | null
          entered_by: string | null
          exited_at: string | null
          exited_by: string | null
          file_id: string
          id: string
          state_id: string
        }
        Insert: {
          duration_seconds?: number | null
          entered_at?: string | null
          entered_by?: string | null
          exited_at?: string | null
          exited_by?: string | null
          file_id: string
          id?: string
          state_id: string
        }
        Update: {
          duration_seconds?: number | null
          entered_at?: string | null
          entered_by?: string | null
          exited_at?: string | null
          exited_by?: string | null
          file_id?: string
          id?: string
          state_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_state_entry_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_state_entry_exited_by_fkey"
            columns: ["exited_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_state_entry_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_state_entry_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_state_entry_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "workflow_state"
            referencedColumns: ["id"]
          },
        ]
      }
      file_version: {
        Row: {
          comment: string | null
          content_hash: string
          created_at: string | null
          created_by: string
          description: string | null
          file_id: string
          file_size: number | null
          id: string
          inspection_hash: string | null
          part_number: string | null
          references_recorded_at: string | null
          revision: string
          state: string
          version: number
          workflow_state_id: string | null
        }
        Insert: {
          comment?: string | null
          content_hash: string
          created_at?: string | null
          created_by: string
          description?: string | null
          file_id: string
          file_size?: number | null
          id?: string
          inspection_hash?: string | null
          part_number?: string | null
          references_recorded_at?: string | null
          revision: string
          state?: string
          version: number
          workflow_state_id?: string | null
        }
        Update: {
          comment?: string | null
          content_hash?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          file_id?: string
          file_size?: number | null
          id?: string
          inspection_hash?: string | null
          part_number?: string | null
          references_recorded_at?: string | null
          revision?: string
          state?: string
          version?: number
          workflow_state_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_version_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_version_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_version_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_version_workflow_state_id_fkey"
            columns: ["workflow_state_id"]
            isOneToOne: false
            referencedRelation: "workflow_state"
            referencedColumns: ["id"]
          },
        ]
      }
      file_version_reference: {
        Row: {
          child_file_id: string | null
          child_path: string
          child_version_id: string | null
          configuration: string | null
          created_at: string
          id: string
          is_exact: boolean
          org_id: string
          parent_file_id: string
          parent_version_id: string
          quantity: number
          reference_type: Database["public"]["Enums"]["reference_type"]
        }
        Insert: {
          child_file_id?: string | null
          child_path: string
          child_version_id?: string | null
          configuration?: string | null
          created_at?: string
          id?: string
          is_exact?: boolean
          org_id: string
          parent_file_id: string
          parent_version_id: string
          quantity?: number
          reference_type?: Database["public"]["Enums"]["reference_type"]
        }
        Update: {
          child_file_id?: string | null
          child_path?: string
          child_version_id?: string | null
          configuration?: string | null
          created_at?: string
          id?: string
          is_exact?: boolean
          org_id?: string
          parent_file_id?: string
          parent_version_id?: string
          quantity?: number
          reference_type?: Database["public"]["Enums"]["reference_type"]
        }
        Relationships: [
          {
            foreignKeyName: "file_version_reference_child_file_id_fkey"
            columns: ["child_file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_version_reference_child_file_id_fkey"
            columns: ["child_file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_version_reference_child_version_id_fkey"
            columns: ["child_version_id"]
            isOneToOne: false
            referencedRelation: "file_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_version_reference_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_version_reference_parent_file_id_fkey"
            columns: ["parent_file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_version_reference_parent_file_id_fkey"
            columns: ["parent_file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_version_reference_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "file_version"
            referencedColumns: ["id"]
          },
        ]
      }
      file_watcher: {
        Row: {
          created_at: string | null
          file_id: string
          id: string
          is_notified_on_checkin: boolean | null
          is_notified_on_checkout: boolean | null
          is_notified_on_review: boolean | null
          is_notified_on_state_change: boolean | null
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_id: string
          id?: string
          is_notified_on_checkin?: boolean | null
          is_notified_on_checkout?: boolean | null
          is_notified_on_review?: boolean | null
          is_notified_on_state_change?: boolean | null
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_id?: string
          id?: string
          is_notified_on_checkin?: boolean | null
          is_notified_on_checkout?: boolean | null
          is_notified_on_review?: boolean | null
          is_notified_on_state_change?: boolean | null
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_watcher_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_watcher_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_watcher_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_watcher_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      file_workflow_assignment: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          current_state_id: string | null
          file_id: string
          id: string
          workflow_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          current_state_id?: string | null
          file_id: string
          id?: string
          workflow_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          current_state_id?: string | null
          file_id?: string
          id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_workflow_assignment_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_workflow_assignment_current_state_id_fkey"
            columns: ["current_state_id"]
            isOneToOne: false
            referencedRelation: "workflow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_workflow_assignment_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_workflow_assignment_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_workflow_assignment_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_template"
            referencedColumns: ["id"]
          },
        ]
      }
      folder: {
        Row: {
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          folder_path: string
          id: string
          org_id: string
          vault_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          folder_path: string
          id?: string
          org_id: string
          vault_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          folder_path?: string
          id?: string
          org_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_characteristic: {
        Row: {
          aql: string | null
          balloon_number: string | null
          char_id: string | null
          char_type: string | null
          classification: string | null
          comments: string | null
          created_at: string | null
          created_by: string | null
          file_id: string
          id: string
          inspection_method: string | null
          internal_inspection_rate: number | null
          is_key: boolean
          lower_limit: string | null
          minus_tolerance: string | null
          nominal_value: string | null
          operation: string | null
          org_id: string
          plus_tolerance: string | null
          reference: string | null
          sample_size: number | null
          sort_order: number
          source_key: string | null
          source_sheet: string | null
          source_view: string | null
          sub_type: string | null
          supplier_inspection_rate: number | null
          unit: string | null
          updated_at: string | null
          updated_by: string | null
          upper_limit: string | null
          zone: string | null
        }
        Insert: {
          aql?: string | null
          balloon_number?: string | null
          char_id?: string | null
          char_type?: string | null
          classification?: string | null
          comments?: string | null
          created_at?: string | null
          created_by?: string | null
          file_id: string
          id?: string
          inspection_method?: string | null
          internal_inspection_rate?: number | null
          is_key?: boolean
          lower_limit?: string | null
          minus_tolerance?: string | null
          nominal_value?: string | null
          operation?: string | null
          org_id: string
          plus_tolerance?: string | null
          reference?: string | null
          sample_size?: number | null
          sort_order?: number
          source_key?: string | null
          source_sheet?: string | null
          source_view?: string | null
          sub_type?: string | null
          supplier_inspection_rate?: number | null
          unit?: string | null
          updated_at?: string | null
          updated_by?: string | null
          upper_limit?: string | null
          zone?: string | null
        }
        Update: {
          aql?: string | null
          balloon_number?: string | null
          char_id?: string | null
          char_type?: string | null
          classification?: string | null
          comments?: string | null
          created_at?: string | null
          created_by?: string | null
          file_id?: string
          id?: string
          inspection_method?: string | null
          internal_inspection_rate?: number | null
          is_key?: boolean
          lower_limit?: string | null
          minus_tolerance?: string | null
          nominal_value?: string | null
          operation?: string | null
          org_id?: string
          plus_tolerance?: string | null
          reference?: string | null
          sample_size?: number | null
          sort_order?: number
          source_key?: string | null
          source_sheet?: string | null
          source_view?: string | null
          sub_type?: string | null
          supplier_inspection_rate?: number | null
          unit?: string | null
          updated_at?: string | null
          updated_by?: string | null
          upper_limit?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_characteristic_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_characteristic_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_characteristic_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_characteristic_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_characteristic_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_characteristic_version: {
        Row: {
          aql: string | null
          balloon_number: string | null
          char_id: string | null
          char_type: string | null
          classification: string | null
          comments: string | null
          created_at: string | null
          file_version_id: string
          id: string
          inspection_method: string | null
          internal_inspection_rate: number | null
          is_key: boolean
          lower_limit: string | null
          minus_tolerance: string | null
          nominal_value: string | null
          operation: string | null
          org_id: string
          plus_tolerance: string | null
          reference: string | null
          sample_size: number | null
          sort_order: number
          source_key: string | null
          source_sheet: string | null
          source_view: string | null
          sub_type: string | null
          supplier_inspection_rate: number | null
          unit: string | null
          upper_limit: string | null
          zone: string | null
        }
        Insert: {
          aql?: string | null
          balloon_number?: string | null
          char_id?: string | null
          char_type?: string | null
          classification?: string | null
          comments?: string | null
          created_at?: string | null
          file_version_id: string
          id?: string
          inspection_method?: string | null
          internal_inspection_rate?: number | null
          is_key?: boolean
          lower_limit?: string | null
          minus_tolerance?: string | null
          nominal_value?: string | null
          operation?: string | null
          org_id: string
          plus_tolerance?: string | null
          reference?: string | null
          sample_size?: number | null
          sort_order?: number
          source_key?: string | null
          source_sheet?: string | null
          source_view?: string | null
          sub_type?: string | null
          supplier_inspection_rate?: number | null
          unit?: string | null
          upper_limit?: string | null
          zone?: string | null
        }
        Update: {
          aql?: string | null
          balloon_number?: string | null
          char_id?: string | null
          char_type?: string | null
          classification?: string | null
          comments?: string | null
          created_at?: string | null
          file_version_id?: string
          id?: string
          inspection_method?: string | null
          internal_inspection_rate?: number | null
          is_key?: boolean
          lower_limit?: string | null
          minus_tolerance?: string | null
          nominal_value?: string | null
          operation?: string | null
          org_id?: string
          plus_tolerance?: string | null
          reference?: string | null
          sample_size?: number | null
          sort_order?: number
          source_key?: string | null
          source_sheet?: string | null
          source_view?: string | null
          sub_type?: string | null
          supplier_inspection_rate?: number | null
          unit?: string | null
          upper_limit?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_characteristic_version_file_version_id_fkey"
            columns: ["file_version_id"]
            isOneToOne: false
            referencedRelation: "file_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_characteristic_version_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_method: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_method_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_method_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_credential: {
        Row: {
          created_at: string | null
          id: string
          org_id: string
          owner_id: string
          owner_type: string
          secret: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id: string
          owner_id: string
          owner_type: string
          secret?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string
          owner_id?: string
          owner_type?: string
          secret?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_credential_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_credential_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_log: {
        Row: {
          cancel_requested_by: string | null
          completed_at: string | null
          error_details: Json | null
          error_message: string | null
          heartbeat_at: string | null
          id: string
          integration_id: string
          is_cancel_requested: boolean
          org_id: string
          phase: string | null
          phase_count: number | null
          phase_index: number | null
          progress_current: number | null
          progress_total: number | null
          records_created: number | null
          records_errored: number | null
          records_processed: number | null
          records_skipped: number | null
          records_updated: number | null
          started_at: string | null
          status: string
          sync_direction: string
          sync_type: string
          sync_watermark_at: string | null
          trigger_type: string | null
          triggered_by: string | null
        }
        Insert: {
          cancel_requested_by?: string | null
          completed_at?: string | null
          error_details?: Json | null
          error_message?: string | null
          heartbeat_at?: string | null
          id?: string
          integration_id: string
          is_cancel_requested?: boolean
          org_id: string
          phase?: string | null
          phase_count?: number | null
          phase_index?: number | null
          progress_current?: number | null
          progress_total?: number | null
          records_created?: number | null
          records_errored?: number | null
          records_processed?: number | null
          records_skipped?: number | null
          records_updated?: number | null
          started_at?: string | null
          status: string
          sync_direction?: string
          sync_type: string
          sync_watermark_at?: string | null
          trigger_type?: string | null
          triggered_by?: string | null
        }
        Update: {
          cancel_requested_by?: string | null
          completed_at?: string | null
          error_details?: Json | null
          error_message?: string | null
          heartbeat_at?: string | null
          id?: string
          integration_id?: string
          is_cancel_requested?: boolean
          org_id?: string
          phase?: string | null
          phase_count?: number | null
          phase_index?: number | null
          progress_current?: number | null
          progress_total?: number | null
          records_created?: number | null
          records_errored?: number | null
          records_processed?: number | null
          records_skipped?: number | null
          records_updated?: number | null
          started_at?: string | null
          status?: string
          sync_direction?: string
          sync_type?: string
          sync_watermark_at?: string | null
          trigger_type?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_log_cancel_requested_by_fkey"
            columns: ["cancel_requested_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_log_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "org_integration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_log_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      item_designation: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          org_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_designation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_designation_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      item_designation_assignment: {
        Row: {
          designation_id: string
          id: string
          org_id: string
          part_number: string
          updated_at: string | null
          updated_by: string | null
          vault_id: string
        }
        Insert: {
          designation_id: string
          id?: string
          org_id: string
          part_number: string
          updated_at?: string | null
          updated_by?: string | null
          vault_id: string
        }
        Update: {
          designation_id?: string
          id?: string
          org_id?: string
          part_number?: string
          updated_at?: string | null
          updated_by?: string | null
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_designation_assignment_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "item_designation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_designation_assignment_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_designation_assignment_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_designation_assignment_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
        ]
      }
      item_image: {
        Row: {
          icon_color: string | null
          icon_name: string | null
          id: string
          image_storage_path: string | null
          image_type: string
          org_id: string
          part_number: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          icon_color?: string | null
          icon_name?: string | null
          id?: string
          image_storage_path?: string | null
          image_type?: string
          org_id: string
          part_number: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          icon_color?: string | null
          icon_name?: string | null
          id?: string
          image_storage_path?: string | null
          image_type?: string
          org_id?: string
          part_number?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_image_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_image_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      job_title: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_system: boolean | null
          name: string
          org_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          org_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          org_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_title_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_title_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_title_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      module_access: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          module_id: string
          org_id: string
          team_id: string | null
          user_id: string | null
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          module_id: string
          org_id: string
          team_id?: string | null
          user_id?: string | null
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          module_id?: string
          org_id?: string
          team_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "module_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_access_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_access_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      notification: {
        Row: {
          action_completed_at: string | null
          action_type: string | null
          action_url: string | null
          category: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          expires_at: string | null
          from_user_id: string | null
          id: string
          is_action_completed: boolean | null
          is_read: boolean | null
          message: string | null
          org_id: string
          priority: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_completed_at?: string | null
          action_type?: string | null
          action_url?: string | null
          category?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          from_user_id?: string | null
          id?: string
          is_action_completed?: boolean | null
          is_read?: boolean | null
          message?: string | null
          org_id: string
          priority?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_completed_at?: string | null
          action_type?: string | null
          action_url?: string | null
          category?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          from_user_id?: string | null
          id?: string
          is_action_completed?: boolean | null
          is_read?: boolean | null
          message?: string | null
          org_id?: string
          priority?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      odoo_saved_config: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          database: string
          description: string | null
          id: string
          is_active: boolean | null
          is_last_test_successful: boolean | null
          last_test_error: string | null
          last_tested_at: string | null
          name: string
          org_id: string
          updated_at: string | null
          updated_by: string | null
          url: string
          username: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          database: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_last_test_successful?: boolean | null
          last_test_error?: string | null
          last_tested_at?: string | null
          name: string
          org_id: string
          updated_at?: string | null
          updated_by?: string | null
          url: string
          username: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          database?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_last_test_successful?: boolean | null
          last_test_error?: string | null
          last_tested_at?: string | null
          name?: string
          org_id?: string
          updated_at?: string | null
          updated_by?: string | null
          url?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "odoo_saved_config_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odoo_saved_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odoo_saved_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      org_address: {
        Row: {
          address_line1: string
          address_line2: string | null
          address_type: Database["public"]["Enums"]["address_type"]
          attention_to: string | null
          city: string
          company_name: string | null
          contact_name: string | null
          country: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          label: string
          org_id: string
          phone: string | null
          postal_code: string | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          address_type: Database["public"]["Enums"]["address_type"]
          attention_to?: string | null
          city: string
          company_name?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          label: string
          org_id: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          address_type?: Database["public"]["Enums"]["address_type"]
          attention_to?: string | null
          city?: string
          company_name?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          label?: string
          org_id?: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_address_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      org_installed_extension: {
        Row: {
          category: string | null
          extension_id: string
          installed_at: string | null
          installed_by: string | null
          is_enabled: boolean | null
          manifest: Json
          org_id: string
          package_path: string | null
          package_sha256: string | null
          version: string
        }
        Insert: {
          category?: string | null
          extension_id: string
          installed_at?: string | null
          installed_by?: string | null
          is_enabled?: boolean | null
          manifest: Json
          org_id: string
          package_path?: string | null
          package_sha256?: string | null
          version: string
        }
        Update: {
          category?: string | null
          extension_id?: string
          installed_at?: string | null
          installed_by?: string | null
          is_enabled?: boolean | null
          manifest?: Json
          org_id?: string
          package_path?: string | null
          package_sha256?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_installed_extension_installed_by_fkey"
            columns: ["installed_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_installed_extension_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      org_integration: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          integration_type: string
          is_active: boolean | null
          is_auto_sync: boolean | null
          is_connected: boolean | null
          last_connected_at: string | null
          last_error: string | null
          last_sync_at: string | null
          last_sync_count: number | null
          last_sync_message: string | null
          last_sync_status: string | null
          org_id: string
          settings: Json
          sync_interval_minutes: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          integration_type: string
          is_active?: boolean | null
          is_auto_sync?: boolean | null
          is_connected?: boolean | null
          last_connected_at?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          last_sync_count?: number | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          org_id: string
          settings?: Json
          sync_interval_minutes?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          integration_type?: string
          is_active?: boolean | null
          is_auto_sync?: boolean | null
          is_connected?: boolean | null
          last_connected_at?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          last_sync_count?: number | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          org_id?: string
          settings?: Json
          sync_interval_minutes?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_integration_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_integration_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_integration_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      organization: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          auth_providers: Json | null
          city: string | null
          column_defaults_forced_at: string | null
          contact_email: string | null
          country: string | null
          created_at: string | null
          default_new_user_team_id: string | null
          email_domains: string[]
          google_drive_client_id: string | null
          google_drive_client_secret: string | null
          google_drive_inspection_template_folder_id: string | null
          id: string
          is_google_drive_enabled: boolean | null
          item_definition_settings: Json | null
          logo_storage_path: string | null
          logo_url: string | null
          module_defaults: Json | null
          module_defaults_forced_at: string | null
          name: string
          phone: string | null
          postal_code: string | null
          revision_scheme: Database["public"]["Enums"]["revision_scheme"] | null
          rfq_settings: Json | null
          serialization_settings: Json | null
          settings: Json | null
          slug: string
          state: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          auth_providers?: Json | null
          city?: string | null
          column_defaults_forced_at?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string | null
          default_new_user_team_id?: string | null
          email_domains?: string[]
          google_drive_client_id?: string | null
          google_drive_client_secret?: string | null
          google_drive_inspection_template_folder_id?: string | null
          id?: string
          is_google_drive_enabled?: boolean | null
          item_definition_settings?: Json | null
          logo_storage_path?: string | null
          logo_url?: string | null
          module_defaults?: Json | null
          module_defaults_forced_at?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          revision_scheme?:
            | Database["public"]["Enums"]["revision_scheme"]
            | null
          rfq_settings?: Json | null
          serialization_settings?: Json | null
          settings?: Json | null
          slug: string
          state?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          auth_providers?: Json | null
          city?: string | null
          column_defaults_forced_at?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string | null
          default_new_user_team_id?: string | null
          email_domains?: string[]
          google_drive_client_id?: string | null
          google_drive_client_secret?: string | null
          google_drive_inspection_template_folder_id?: string | null
          id?: string
          is_google_drive_enabled?: boolean | null
          item_definition_settings?: Json | null
          logo_storage_path?: string | null
          logo_url?: string | null
          module_defaults?: Json | null
          module_defaults_forced_at?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          revision_scheme?:
            | Database["public"]["Enums"]["revision_scheme"]
            | null
          rfq_settings?: Json | null
          serialization_settings?: Json | null
          settings?: Json | null
          slug?: string
          state?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_default_new_user_team_id_fkey"
            columns: ["default_new_user_team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      part_supplier: {
        Row: {
          created_at: string | null
          created_by: string | null
          currency: string | null
          erp_id: string | null
          erp_synced_at: string | null
          file_id: string
          id: string
          is_active: boolean | null
          is_preferred: boolean | null
          is_qualified: boolean | null
          lead_time_days: number | null
          min_order_qty: number | null
          notes: string | null
          order_multiple: number | null
          org_id: string
          price_breaks: Json | null
          price_unit: string | null
          price_updated_at: string | null
          qualified_at: string | null
          qualified_by: string | null
          supplier_description: string | null
          supplier_id: string
          supplier_part_number: string | null
          supplier_url: string | null
          unit_price: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          erp_id?: string | null
          erp_synced_at?: string | null
          file_id: string
          id?: string
          is_active?: boolean | null
          is_preferred?: boolean | null
          is_qualified?: boolean | null
          lead_time_days?: number | null
          min_order_qty?: number | null
          notes?: string | null
          order_multiple?: number | null
          org_id: string
          price_breaks?: Json | null
          price_unit?: string | null
          price_updated_at?: string | null
          qualified_at?: string | null
          qualified_by?: string | null
          supplier_description?: string | null
          supplier_id: string
          supplier_part_number?: string | null
          supplier_url?: string | null
          unit_price?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          erp_id?: string | null
          erp_synced_at?: string | null
          file_id?: string
          id?: string
          is_active?: boolean | null
          is_preferred?: boolean | null
          is_qualified?: boolean | null
          lead_time_days?: number | null
          min_order_qty?: number | null
          notes?: string | null
          order_multiple?: number | null
          org_id?: string
          price_breaks?: Json | null
          price_unit?: string | null
          price_updated_at?: string | null
          qualified_at?: string | null
          qualified_by?: string | null
          supplier_description?: string | null
          supplier_id?: string
          supplier_part_number?: string | null
          supplier_url?: string | null
          unit_price?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_supplier_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_supplier_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_supplier_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_supplier_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_supplier_qualified_by_fkey"
            columns: ["qualified_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_supplier_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_supplier_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_org_member: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          email: string
          expires_at: string | null
          full_name: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          notes: string | null
          org_id: string
          role: Database["public"]["Enums"]["user_role"] | null
          solidworks_license_ids: string[] | null
          team_ids: string[] | null
          vault_ids: string[] | null
          workflow_role_ids: string[] | null
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          email: string
          expires_at?: string | null
          full_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          notes?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["user_role"] | null
          solidworks_license_ids?: string[] | null
          team_ids?: string[] | null
          vault_ids?: string[] | null
          workflow_role_ids?: string[] | null
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          email?: string
          expires_at?: string | null
          full_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          notes?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          solidworks_license_ids?: string[] | null
          team_ids?: string[] | null
          vault_ids?: string[] | null
          workflow_role_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_org_member_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_org_member_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_org_member_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_preset: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_system: boolean | null
          name: string
          org_id: string
          permissions: Json | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          org_id: string
          permissions?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          org_id?: string
          permissions?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_preset_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_preset_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_preset_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      process_template: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          org_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          org_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          org_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_template_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_template_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_template_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      process_template_item: {
        Row: {
          created_at: string | null
          default_accountable: string | null
          default_consulted: string | null
          default_duration_days: number | null
          default_informed: string | null
          default_offset_days: number | null
          default_responsible: string | null
          description: string | null
          doc_number: string | null
          id: string
          is_required_for_gate: boolean | null
          name: string
          phase_id: string
          sort_order: number
          uid: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_accountable?: string | null
          default_consulted?: string | null
          default_duration_days?: number | null
          default_informed?: string | null
          default_offset_days?: number | null
          default_responsible?: string | null
          description?: string | null
          doc_number?: string | null
          id?: string
          is_required_for_gate?: boolean | null
          name: string
          phase_id: string
          sort_order?: number
          uid?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_accountable?: string | null
          default_consulted?: string | null
          default_duration_days?: number | null
          default_informed?: string | null
          default_offset_days?: number | null
          default_responsible?: string | null
          description?: string | null
          doc_number?: string | null
          id?: string
          is_required_for_gate?: boolean | null
          name?: string
          phase_id?: string
          sort_order?: number
          uid?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_template_item_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "process_template_phase"
            referencedColumns: ["id"]
          },
        ]
      }
      process_template_phase: {
        Row: {
          created_at: string | null
          description: string | null
          gate_description: string | null
          gate_name: string | null
          id: string
          name: string
          sort_order: number
          template_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          gate_description?: string | null
          gate_name?: string | null
          id?: string
          name: string
          sort_order?: number
          template_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          gate_description?: string | null
          gate_name?: string | null
          id?: string
          name?: string
          sort_order?: number
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_template_phase_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_template"
            referencedColumns: ["id"]
          },
        ]
      }
      release_file: {
        Row: {
          created_at: string | null
          file_id: string
          file_name: string
          file_size: number | null
          file_type: Database["public"]["Enums"]["release_file_type"]
          file_version_id: string | null
          generated_at: string | null
          generated_by: string | null
          id: string
          local_path: string | null
          org_id: string
          revision: string | null
          rfq_id: string | null
          rfq_item_id: string | null
          storage_hash: string | null
          storage_path: string | null
          updated_at: string | null
          version: number
        }
        Insert: {
          created_at?: string | null
          file_id: string
          file_name: string
          file_size?: number | null
          file_type: Database["public"]["Enums"]["release_file_type"]
          file_version_id?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          local_path?: string | null
          org_id: string
          revision?: string | null
          rfq_id?: string | null
          rfq_item_id?: string | null
          storage_hash?: string | null
          storage_path?: string | null
          updated_at?: string | null
          version: number
        }
        Update: {
          created_at?: string | null
          file_id?: string
          file_name?: string
          file_size?: number | null
          file_type?: Database["public"]["Enums"]["release_file_type"]
          file_version_id?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          local_path?: string | null
          org_id?: string
          revision?: string | null
          rfq_id?: string | null
          rfq_item_id?: string | null
          storage_hash?: string | null
          storage_path?: string | null
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "release_file_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_file_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_file_file_version_id_fkey"
            columns: ["file_version_id"]
            isOneToOne: false
            referencedRelation: "file_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_file_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_file_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_file_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_file_rfq_item_id_fkey"
            columns: ["rfq_item_id"]
            isOneToOne: false
            referencedRelation: "rfq_item"
            referencedColumns: ["id"]
          },
        ]
      }
      review: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string | null
          current_round: number
          due_date: string | null
          file_id: string | null
          file_version: number | null
          id: string
          message: string | null
          mode: string
          org_id: string
          priority: string
          requested_at: string | null
          requested_by: string
          status: Database["public"]["Enums"]["review_status"]
          team_id: string | null
          title: string | null
          updated_at: string | null
          vault_id: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_round?: number
          due_date?: string | null
          file_id?: string | null
          file_version?: number | null
          id?: string
          message?: string | null
          mode?: string
          org_id: string
          priority?: string
          requested_at?: string | null
          requested_by: string
          status?: Database["public"]["Enums"]["review_status"]
          team_id?: string | null
          title?: string | null
          updated_at?: string | null
          vault_id?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_round?: number
          due_date?: string | null
          file_id?: string | null
          file_version?: number | null
          id?: string
          message?: string | null
          mode?: string
          org_id?: string
          priority?: string
          requested_at?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["review_status"]
          team_id?: string | null
          title?: string | null
          updated_at?: string | null
          vault_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
        ]
      }
      review_decision: {
        Row: {
          comment: string | null
          decided_at: string
          decision: string
          id: string
          is_legacy: boolean
          item_id: string
          org_id: string
          review_id: string
          reviewer_id: string
          round_number: number
        }
        Insert: {
          comment?: string | null
          decided_at?: string
          decision: string
          id?: string
          is_legacy?: boolean
          item_id: string
          org_id: string
          review_id: string
          reviewer_id: string
          round_number: number
        }
        Update: {
          comment?: string | null
          decided_at?: string
          decision?: string
          id?: string
          is_legacy?: boolean
          item_id?: string
          org_id?: string
          review_id?: string
          reviewer_id?: string
          round_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_decision_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "review_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_decision_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_decision_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_decision_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      review_item: {
        Row: {
          added_in_round: number
          advanced_at: string | null
          advanced_to_state_id: string | null
          created_at: string
          file_id: string
          file_version_id: string
          id: string
          org_id: string
          outcome: string
          review_id: string
          sort_order: number
          vault_id: string | null
        }
        Insert: {
          added_in_round?: number
          advanced_at?: string | null
          advanced_to_state_id?: string | null
          created_at?: string
          file_id: string
          file_version_id: string
          id?: string
          org_id: string
          outcome?: string
          review_id: string
          sort_order?: number
          vault_id?: string | null
        }
        Update: {
          added_in_round?: number
          advanced_at?: string | null
          advanced_to_state_id?: string | null
          created_at?: string
          file_id?: string
          file_version_id?: string
          id?: string
          org_id?: string
          outcome?: string
          review_id?: string
          sort_order?: number
          vault_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_item_advanced_to_state_id_fkey"
            columns: ["advanced_to_state_id"]
            isOneToOne: false
            referencedRelation: "workflow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_item_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_item_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_item_file_version_id_fkey"
            columns: ["file_version_id"]
            isOneToOne: false
            referencedRelation: "file_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_item_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_item_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_item_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
        ]
      }
      review_response: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          org_id: string
          responded_at: string | null
          review_id: string
          reviewer_id: string
          round_number: number
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string | null
          via_team_id: string | null
          withdrawn_at: string | null
          withdrawn_reason: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          org_id: string
          responded_at?: string | null
          review_id: string
          reviewer_id: string
          round_number?: number
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string | null
          via_team_id?: string | null
          withdrawn_at?: string | null
          withdrawn_reason?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          org_id?: string
          responded_at?: string | null
          review_id?: string
          reviewer_id?: string
          round_number?: number
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string | null
          via_team_id?: string | null
          withdrawn_at?: string | null
          withdrawn_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_response_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_response_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_response_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_response_via_team_id_fkey"
            columns: ["via_team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      review_round: {
        Row: {
          closed_at: string | null
          id: string
          note: string | null
          opened_at: string
          opened_by: string | null
          org_id: string
          outcome: string | null
          review_id: string
          round_number: number
        }
        Insert: {
          closed_at?: string | null
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          org_id: string
          outcome?: string | null
          review_id: string
          round_number: number
        }
        Update: {
          closed_at?: string | null
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          org_id?: string
          outcome?: string | null
          review_id?: string
          round_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_round_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_round_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_round_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      review_round_item: {
        Row: {
          decided_at: string | null
          file_version_id: string
          id: string
          is_carried_forward: boolean
          item_id: string
          org_id: string
          outcome: string
          review_id: string
          round_number: number
        }
        Insert: {
          decided_at?: string | null
          file_version_id: string
          id?: string
          is_carried_forward?: boolean
          item_id: string
          org_id: string
          outcome?: string
          review_id: string
          round_number: number
        }
        Update: {
          decided_at?: string | null
          file_version_id?: string
          id?: string
          is_carried_forward?: boolean
          item_id?: string
          org_id?: string
          outcome?: string
          review_id?: string
          round_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_round_item_file_version_id_fkey"
            columns: ["file_version_id"]
            isOneToOne: false
            referencedRelation: "file_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_round_item_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "review_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_round_item_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_round_item_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq: {
        Row: {
          award_notes: string | null
          awarded_at: string | null
          awarded_by: string | null
          awarded_supplier_id: string | null
          billing_address_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          incoterms: string | null
          internal_notes: string | null
          is_first_article_required: boolean | null
          is_partial_quote_allowed: boolean | null
          is_quality_report_required: boolean | null
          is_release_files_generated: boolean | null
          is_samples_required: boolean | null
          org_id: string
          pdf_generated_at: string | null
          pdf_url: string | null
          release_files_generated_at: string | null
          release_folder_path: string | null
          required_date: string | null
          rfq_number: string
          shipping_address: string | null
          shipping_address_id: string | null
          shipping_notes: string | null
          status: Database["public"]["Enums"]["rfq_status"]
          supplier_notes: string | null
          title: string
          updated_at: string | null
          updated_by: string | null
          valid_until: string | null
        }
        Insert: {
          award_notes?: string | null
          awarded_at?: string | null
          awarded_by?: string | null
          awarded_supplier_id?: string | null
          billing_address_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          incoterms?: string | null
          internal_notes?: string | null
          is_first_article_required?: boolean | null
          is_partial_quote_allowed?: boolean | null
          is_quality_report_required?: boolean | null
          is_release_files_generated?: boolean | null
          is_samples_required?: boolean | null
          org_id: string
          pdf_generated_at?: string | null
          pdf_url?: string | null
          release_files_generated_at?: string | null
          release_folder_path?: string | null
          required_date?: string | null
          rfq_number: string
          shipping_address?: string | null
          shipping_address_id?: string | null
          shipping_notes?: string | null
          status?: Database["public"]["Enums"]["rfq_status"]
          supplier_notes?: string | null
          title: string
          updated_at?: string | null
          updated_by?: string | null
          valid_until?: string | null
        }
        Update: {
          award_notes?: string | null
          awarded_at?: string | null
          awarded_by?: string | null
          awarded_supplier_id?: string | null
          billing_address_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          incoterms?: string | null
          internal_notes?: string | null
          is_first_article_required?: boolean | null
          is_partial_quote_allowed?: boolean | null
          is_quality_report_required?: boolean | null
          is_release_files_generated?: boolean | null
          is_samples_required?: boolean | null
          org_id?: string
          pdf_generated_at?: string | null
          pdf_url?: string | null
          release_files_generated_at?: string | null
          release_folder_path?: string | null
          required_date?: string | null
          rfq_number?: string
          shipping_address?: string | null
          shipping_address_id?: string | null
          shipping_notes?: string | null
          status?: Database["public"]["Enums"]["rfq_status"]
          supplier_notes?: string | null
          title?: string
          updated_at?: string | null
          updated_by?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_awarded_supplier_id_fkey"
            columns: ["awarded_supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_billing_address_id_fkey"
            columns: ["billing_address_id"]
            isOneToOne: false
            referencedRelation: "org_address"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_shipping_address_id_fkey"
            columns: ["shipping_address_id"]
            isOneToOne: false
            referencedRelation: "org_address"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_activity: {
        Row: {
          action: string
          details: Json | null
          id: string
          performed_at: string | null
          performed_by: string | null
          rfq_id: string
          supplier_contact_id: string | null
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          performed_at?: string | null
          performed_by?: string | null
          rfq_id: string
          supplier_contact_id?: string | null
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          performed_at?: string | null
          performed_by?: string | null
          rfq_id?: string
          supplier_contact_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_activity_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_activity_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_activity_supplier_contact_id_fkey"
            columns: ["supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "supplier_contact"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_item: {
        Row: {
          created_at: string | null
          description: string | null
          file_id: string | null
          finish: string | null
          id: string
          line_number: number
          material: string | null
          notes: string | null
          part_number: string | null
          quantity: number
          release_files_error: string | null
          release_files_status: string | null
          revision: string | null
          rfq_id: string
          sort_order: number | null
          uom: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_id?: string | null
          finish?: string | null
          id?: string
          line_number: number
          material?: string | null
          notes?: string | null
          part_number?: string | null
          quantity?: number
          release_files_error?: string | null
          release_files_status?: string | null
          revision?: string | null
          rfq_id: string
          sort_order?: number | null
          uom?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_id?: string | null
          finish?: string | null
          id?: string
          line_number?: number
          material?: string | null
          notes?: string | null
          part_number?: string | null
          quantity?: number
          release_files_error?: string | null
          release_files_status?: string | null
          revision?: string | null
          rfq_id?: string
          sort_order?: number | null
          uom?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_item_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_item_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_item_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_number_counter: {
        Row: {
          last_number: number
          org_id: string
          updated_at: string | null
          year: number
        }
        Insert: {
          last_number?: number
          org_id: string
          updated_at?: string | null
          year: number
        }
        Update: {
          last_number?: number
          org_id?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "rfq_number_counter_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_quote: {
        Row: {
          created_at: string | null
          currency: string | null
          id: string
          is_selected: boolean | null
          lead_time_days: number | null
          min_order_qty: number | null
          notes: string | null
          rfq_id: string
          rfq_item_id: string
          supplier_id: string
          unit_price: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          id?: string
          is_selected?: boolean | null
          lead_time_days?: number | null
          min_order_qty?: number | null
          notes?: string | null
          rfq_id: string
          rfq_item_id: string
          supplier_id: string
          unit_price?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          id?: string
          is_selected?: boolean | null
          lead_time_days?: number | null
          min_order_qty?: number | null
          notes?: string | null
          rfq_id?: string
          rfq_item_id?: string
          supplier_id?: string
          unit_price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_quote_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_quote_rfq_item_id_fkey"
            columns: ["rfq_item_id"]
            isOneToOne: false
            referencedRelation: "rfq_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_quote_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_supplier: {
        Row: {
          contact_email: string | null
          contact_id: string | null
          created_at: string | null
          id: string
          responded_at: string | null
          response_status: string | null
          rfq_id: string
          sent_at: string | null
          sent_by: string | null
          sent_via: string | null
          supplier_id: string
          viewed_at: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          responded_at?: string | null
          response_status?: string | null
          rfq_id: string
          sent_at?: string | null
          sent_by?: string | null
          sent_via?: string | null
          supplier_id: string
          viewed_at?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          responded_at?: string | null
          response_status?: string | null
          rfq_id?: string
          sent_at?: string | null
          sent_by?: string | null
          sent_via?: string | null
          supplier_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_supplier_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "supplier_contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_supplier_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_supplier_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_supplier_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_manifest_entry: {
        Row: {
          kind: string
          module: string
          name: string
          probe: string | null
          requires: string | null
          since_version: number
        }
        Insert: {
          kind: string
          module: string
          name: string
          probe?: string | null
          requires?: string | null
          since_version: number
        }
        Update: {
          kind?: string
          module?: string
          name?: string
          probe?: string | null
          requires?: string | null
          since_version?: number
        }
        Relationships: []
      }
      schema_migration: {
        Row: {
          app_version: string | null
          applied_at: string
          applied_by: string | null
          checksum: string
          name: string
          version: number
        }
        Insert: {
          app_version?: string | null
          applied_at?: string
          applied_by?: string | null
          checksum: string
          name: string
          version: number
        }
        Update: {
          app_version?: string | null
          applied_at?: string
          applied_by?: string | null
          checksum?: string
          name?: string
          version?: number
        }
        Relationships: []
      }
      schema_remediation_log: {
        Row: {
          detail: string | null
          id: string
          ran_at: string
          ran_by: string
          release: number
          remediation: string
          rows_acted_on: number
          subjects: Json
        }
        Insert: {
          detail?: string | null
          id?: string
          ran_at?: string
          ran_by?: string
          release: number
          remediation: string
          rows_acted_on: number
          subjects?: Json
        }
        Update: {
          detail?: string | null
          id?: string
          ran_at?: string
          ran_by?: string
          release?: number
          remediation?: string
          rows_acted_on?: number
          subjects?: Json
        }
        Relationships: []
      }
      schema_version: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          description: string | null
          id: number
          version: number
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          description?: string | null
          id?: number
          version?: number
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          description?: string | null
          id?: number
          version?: number
        }
        Relationships: []
      }
      solidworks_license: {
        Row: {
          created_at: string | null
          created_by: string | null
          expiry_date: string | null
          id: string
          license_type:
            | Database["public"]["Enums"]["solidworks_license_type"]
            | null
          nickname: string | null
          notes: string | null
          org_id: string
          product_name: string | null
          purchase_date: string | null
          seats: number | null
          serial_number: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          license_type?:
            | Database["public"]["Enums"]["solidworks_license_type"]
            | null
          nickname?: string | null
          notes?: string | null
          org_id: string
          product_name?: string | null
          purchase_date?: string | null
          seats?: number | null
          serial_number: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          license_type?:
            | Database["public"]["Enums"]["solidworks_license_type"]
            | null
          nickname?: string | null
          notes?: string | null
          org_id?: string
          product_name?: string | null
          purchase_date?: string | null
          seats?: number | null
          serial_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solidworks_license_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solidworks_license_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      solidworks_license_assignment: {
        Row: {
          activated_at: string | null
          assigned_at: string | null
          assigned_by: string | null
          deactivated_at: string | null
          id: string
          is_active: boolean | null
          license_id: string
          machine_id: string | null
          machine_name: string | null
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          deactivated_at?: string | null
          id?: string
          is_active?: boolean | null
          license_id: string
          machine_id?: string | null
          machine_name?: string | null
          user_id: string
        }
        Update: {
          activated_at?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          deactivated_at?: string | null
          id?: string
          is_active?: boolean | null
          license_id?: string
          machine_id?: string | null
          machine_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solidworks_license_assignment_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solidworks_license_assignment_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "solidworks_license"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solidworks_license_assignment_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          approved_at: string | null
          approved_by: string | null
          city: string | null
          code: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          default_lead_time_days: number | null
          erp_id: string | null
          erp_synced_at: string | null
          id: string
          is_active: boolean | null
          is_approved: boolean | null
          min_order_value: number | null
          name: string
          notes: string | null
          org_id: string
          payment_terms: string | null
          postal_code: string | null
          shipping_account: string | null
          state: string | null
          updated_at: string | null
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          code?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          default_lead_time_days?: number | null
          erp_id?: string | null
          erp_synced_at?: string | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          min_order_value?: number | null
          name: string
          notes?: string | null
          org_id: string
          payment_terms?: string | null
          postal_code?: string | null
          shipping_account?: string | null
          state?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          code?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          default_lead_time_days?: number | null
          erp_id?: string | null
          erp_synced_at?: string | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          min_order_value?: number | null
          name?: string
          notes?: string | null
          org_id?: string
          payment_terms?: string | null
          postal_code?: string | null
          shipping_account?: string | null
          state?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contact: {
        Row: {
          auth_method:
            | Database["public"]["Enums"]["supplier_auth_method"]
            | null
          auth_user_id: string | null
          avatar_url: string | null
          can_manage_catalog: boolean | null
          can_submit_quotes: boolean | null
          can_update_pricing: boolean | null
          can_view_orders: boolean | null
          can_view_rfqs: boolean | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean | null
          is_email_verified: boolean | null
          is_phone_verified: boolean | null
          is_primary: boolean | null
          job_title: string | null
          last_sign_in_at: string | null
          phone: string | null
          phone_country_code: string | null
          supplier_id: string
          updated_at: string | null
          wechat_openid: string | null
        }
        Insert: {
          auth_method?:
            | Database["public"]["Enums"]["supplier_auth_method"]
            | null
          auth_user_id?: string | null
          avatar_url?: string | null
          can_manage_catalog?: boolean | null
          can_submit_quotes?: boolean | null
          can_update_pricing?: boolean | null
          can_view_orders?: boolean | null
          can_view_rfqs?: boolean | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          is_email_verified?: boolean | null
          is_phone_verified?: boolean | null
          is_primary?: boolean | null
          job_title?: string | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_country_code?: string | null
          supplier_id: string
          updated_at?: string | null
          wechat_openid?: string | null
        }
        Update: {
          auth_method?:
            | Database["public"]["Enums"]["supplier_auth_method"]
            | null
          auth_user_id?: string | null
          avatar_url?: string | null
          can_manage_catalog?: boolean | null
          can_submit_quotes?: boolean | null
          can_update_pricing?: boolean | null
          can_view_orders?: boolean | null
          can_view_rfqs?: boolean | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          is_email_verified?: boolean | null
          is_phone_verified?: boolean | null
          is_primary?: boolean | null
          job_title?: string | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_country_code?: string | null
          supplier_id?: string
          updated_at?: string | null
          wechat_openid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contact_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invitation: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string | null
          email: string | null
          expires_at: string
          full_name: string
          id: string
          invited_at: string | null
          invited_by: string | null
          org_id: string
          phone: string | null
          supplier_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          email?: string | null
          expires_at: string
          full_name: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          org_id: string
          phone?: string | null
          supplier_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string
          full_name?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          org_id?: string
          phone?: string | null
          supplier_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invitation_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invitation_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invitation_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
        ]
      }
      team: {
        Row: {
          color: string
          created_at: string | null
          created_by: string | null
          description: string | null
          icon: string
          id: string
          is_default: boolean | null
          is_system: boolean | null
          module_defaults: Json | null
          name: string
          org_id: string
          parent_team_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          color?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_default?: boolean | null
          is_system?: boolean | null
          module_defaults?: Json | null
          name: string
          org_id: string
          parent_team_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_default?: boolean | null
          is_system?: boolean | null
          module_defaults?: Json | null
          name?: string
          org_id?: string
          parent_team_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_parent_team_id_fkey"
            columns: ["parent_team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member: {
        Row: {
          added_at: string | null
          added_by: string | null
          id: string
          is_team_admin: boolean | null
          team_id: string
          user_id: string
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          id?: string
          is_team_admin?: boolean | null
          team_id: string
          user_id: string
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          id?: string
          is_team_admin?: boolean | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_member_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      team_permission: {
        Row: {
          actions: Database["public"]["Enums"]["permission_action"][] | null
          granted_at: string | null
          granted_by: string | null
          id: string
          resource: string
          team_id: string
          updated_at: string | null
          updated_by: string | null
          vault_id: string | null
        }
        Insert: {
          actions?: Database["public"]["Enums"]["permission_action"][] | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          resource: string
          team_id: string
          updated_at?: string | null
          updated_by?: string | null
          vault_id?: string | null
        }
        Update: {
          actions?: Database["public"]["Enums"]["permission_action"][] | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          resource?: string
          team_id?: string
          updated_at?: string | null
          updated_by?: string | null
          vault_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_permission_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_permission_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_permission_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_permission_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
        ]
      }
      team_reviewer: {
        Row: {
          added_at: string | null
          added_by: string | null
          id: string
          reviewer_type: string
          role: Database["public"]["Enums"]["user_role"] | null
          team_id: string
          user_id: string | null
          workflow_role_id: string | null
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          id?: string
          reviewer_type: string
          role?: Database["public"]["Enums"]["user_role"] | null
          team_id: string
          user_id?: string | null
          workflow_role_id?: string | null
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          id?: string
          reviewer_type?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          team_id?: string
          user_id?: string | null
          workflow_role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_reviewer_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_reviewer_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_reviewer_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_reviewer_workflow_role_id_fkey"
            columns: ["workflow_role_id"]
            isOneToOne: false
            referencedRelation: "workflow_role"
            referencedColumns: ["id"]
          },
        ]
      }
      team_vault_access: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          team_id: string
          vault_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          team_id: string
          vault_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          team_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_vault_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_vault_access_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_vault_access_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
        ]
      }
      user_job_title: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          title_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          title_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          title_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_job_title_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_job_title_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "job_title"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_job_title_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission: {
        Row: {
          actions: Database["public"]["Enums"]["permission_action"][] | null
          granted_at: string | null
          granted_by: string | null
          id: string
          resource: string
          updated_at: string | null
          updated_by: string | null
          user_id: string
          vault_id: string | null
        }
        Insert: {
          actions?: Database["public"]["Enums"]["permission_action"][] | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          resource: string
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
          vault_id?: string | null
        }
        Update: {
          actions?: Database["public"]["Enums"]["permission_action"][] | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          resource?: string
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
          vault_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
        ]
      }
      user_session: {
        Row: {
          app_version: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_active_at: string | null
          last_seen_at: string | null
          machine_id: string
          machine_name: string | null
          org_id: string
          os_version: string | null
          platform: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_active_at?: string | null
          last_seen_at?: string | null
          machine_id: string
          machine_name?: string | null
          org_id: string
          os_version?: string | null
          platform?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_active_at?: string | null
          last_seen_at?: string | null
          machine_id?: string
          machine_name?: string | null
          org_id?: string
          os_version?: string | null
          platform?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_session_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_session_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      user_workflow_role: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          user_id: string
          workflow_role_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          user_id: string
          workflow_role_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          user_id?: string
          workflow_role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_workflow_role_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_workflow_role_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_workflow_role_workflow_role_id_fkey"
            columns: ["workflow_role_id"]
            isOneToOne: false
            referencedRelation: "workflow_role"
            referencedColumns: ["id"]
          },
        ]
      }
      vault: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          local_path: string | null
          name: string
          org_id: string
          slug: string
          storage_bucket: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          local_path?: string | null
          name: string
          org_id: string
          slug: string
          storage_bucket?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          local_path?: string | null
          name?: string
          org_id?: string
          slug?: string
          storage_bucket?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_access: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          user_id: string
          vault_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          user_id: string
          vault_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          user_id?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_access_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook: {
        Row: {
          created_at: string | null
          created_by: string | null
          custom_headers: Json
          description: string | null
          events: Database["public"]["Enums"]["webhook_event"][]
          failure_count: number | null
          id: string
          is_active: boolean
          last_triggered_at: string | null
          max_retries: number
          name: string
          org_id: string
          retry_delay_seconds: number
          secret: string
          success_count: number | null
          timeout_seconds: number
          trigger_filter: string
          trigger_roles: string[]
          trigger_user_ids: string[]
          updated_at: string | null
          updated_by: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          custom_headers?: Json
          description?: string | null
          events?: Database["public"]["Enums"]["webhook_event"][]
          failure_count?: number | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          max_retries?: number
          name: string
          org_id: string
          retry_delay_seconds?: number
          secret: string
          success_count?: number | null
          timeout_seconds?: number
          trigger_filter?: string
          trigger_roles?: string[]
          trigger_user_ids?: string[]
          updated_at?: string | null
          updated_by?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          custom_headers?: Json
          description?: string | null
          events?: Database["public"]["Enums"]["webhook_event"][]
          failure_count?: number | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          max_retries?: number
          name?: string
          org_id?: string
          retry_delay_seconds?: number
          secret?: string
          success_count?: number | null
          timeout_seconds?: number
          trigger_filter?: string
          trigger_roles?: string[]
          trigger_user_ids?: string[]
          updated_at?: string | null
          updated_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_delivery: {
        Row: {
          attempt_count: number | null
          created_at: string | null
          delivered_at: string | null
          event_id: string | null
          event_type: Database["public"]["Enums"]["webhook_event"]
          id: string
          last_error: string | null
          next_retry_at: string | null
          org_id: string
          payload: Json
          response_body: string | null
          response_headers: Json | null
          response_status: number | null
          status: Database["public"]["Enums"]["webhook_delivery_status"] | null
          webhook_id: string
        }
        Insert: {
          attempt_count?: number | null
          created_at?: string | null
          delivered_at?: string | null
          event_id?: string | null
          event_type: Database["public"]["Enums"]["webhook_event"]
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          org_id: string
          payload: Json
          response_body?: string | null
          response_headers?: Json | null
          response_status?: number | null
          status?: Database["public"]["Enums"]["webhook_delivery_status"] | null
          webhook_id: string
        }
        Update: {
          attempt_count?: number | null
          created_at?: string | null
          delivered_at?: string | null
          event_id?: string | null
          event_type?: Database["public"]["Enums"]["webhook_event"]
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          org_id?: string
          payload?: Json
          response_body?: string | null
          response_headers?: Json | null
          response_status?: number | null
          status?: Database["public"]["Enums"]["webhook_delivery_status"] | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_delivery_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhook"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_gate: {
        Row: {
          approval_mode: Database["public"]["Enums"]["approval_mode"] | null
          can_be_skipped_by: Database["public"]["Enums"]["user_role"][] | null
          checklist_items: Json | null
          conditions: Json | null
          created_at: string | null
          description: string | null
          gate_type: Database["public"]["Enums"]["gate_type"] | null
          id: string
          is_blocking: boolean | null
          name: string
          required_approvals: number | null
          sort_order: number | null
          transition_id: string
        }
        Insert: {
          approval_mode?: Database["public"]["Enums"]["approval_mode"] | null
          can_be_skipped_by?: Database["public"]["Enums"]["user_role"][] | null
          checklist_items?: Json | null
          conditions?: Json | null
          created_at?: string | null
          description?: string | null
          gate_type?: Database["public"]["Enums"]["gate_type"] | null
          id?: string
          is_blocking?: boolean | null
          name: string
          required_approvals?: number | null
          sort_order?: number | null
          transition_id: string
        }
        Update: {
          approval_mode?: Database["public"]["Enums"]["approval_mode"] | null
          can_be_skipped_by?: Database["public"]["Enums"]["user_role"][] | null
          checklist_items?: Json | null
          conditions?: Json | null
          created_at?: string | null
          description?: string | null
          gate_type?: Database["public"]["Enums"]["gate_type"] | null
          id?: string
          is_blocking?: boolean | null
          name?: string
          required_approvals?: number | null
          sort_order?: number | null
          transition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_gate_transition_id_fkey"
            columns: ["transition_id"]
            isOneToOne: false
            referencedRelation: "workflow_transition"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_gate_review: {
        Row: {
          assignee_id: string | null
          attempt_id: string
          checklist_responses: Json | null
          created_at: string | null
          expires_at: string | null
          file_id: string
          gate_id: string
          id: string
          org_id: string
          requested_at: string | null
          requested_by: string
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["review_status"]
          transition_id: string
        }
        Insert: {
          assignee_id?: string | null
          attempt_id: string
          checklist_responses?: Json | null
          created_at?: string | null
          expires_at?: string | null
          file_id: string
          gate_id: string
          id?: string
          org_id: string
          requested_at?: string | null
          requested_by: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          transition_id: string
        }
        Update: {
          assignee_id?: string | null
          attempt_id?: string
          checklist_responses?: Json | null
          created_at?: string | null
          expires_at?: string | null
          file_id?: string
          gate_id?: string
          id?: string
          org_id?: string
          requested_at?: string | null
          requested_by?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          transition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_gate_review_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gate_review_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gate_review_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gate_review_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "workflow_gate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gate_review_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gate_review_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gate_review_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gate_review_transition_id_fkey"
            columns: ["transition_id"]
            isOneToOne: false
            referencedRelation: "workflow_transition"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_gate_reviewer: {
        Row: {
          created_at: string | null
          gate_id: string
          group_name: string | null
          id: string
          reviewer_type: Database["public"]["Enums"]["reviewer_type"]
          role: Database["public"]["Enums"]["user_role"] | null
          user_id: string | null
          workflow_role_id: string | null
        }
        Insert: {
          created_at?: string | null
          gate_id: string
          group_name?: string | null
          id?: string
          reviewer_type: Database["public"]["Enums"]["reviewer_type"]
          role?: Database["public"]["Enums"]["user_role"] | null
          user_id?: string | null
          workflow_role_id?: string | null
        }
        Update: {
          created_at?: string | null
          gate_id?: string
          group_name?: string | null
          id?: string
          reviewer_type?: Database["public"]["Enums"]["reviewer_type"]
          role?: Database["public"]["Enums"]["user_role"] | null
          user_id?: string | null
          workflow_role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_gate_reviewer_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "workflow_gate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gate_reviewer_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gate_reviewer_workflow_role_id_fkey"
            columns: ["workflow_role_id"]
            isOneToOne: false
            referencedRelation: "workflow_role"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_history: {
        Row: {
          approvals_data: Json | null
          comment: string | null
          created_at: string | null
          file_id: string | null
          file_name: string
          file_path: string
          from_state_id: string | null
          from_state_name: string
          id: string
          org_id: string
          performed_at: string
          performed_by: string | null
          performed_by_email: string
          revision_after: string | null
          revision_before: string | null
          to_state_id: string | null
          to_state_name: string
          transition_id: string | null
          transition_name: string | null
          workflow_id: string | null
          workflow_name: string
        }
        Insert: {
          approvals_data?: Json | null
          comment?: string | null
          created_at?: string | null
          file_id?: string | null
          file_name: string
          file_path: string
          from_state_id?: string | null
          from_state_name: string
          id?: string
          org_id: string
          performed_at?: string
          performed_by?: string | null
          performed_by_email: string
          revision_after?: string | null
          revision_before?: string | null
          to_state_id?: string | null
          to_state_name: string
          transition_id?: string | null
          transition_name?: string | null
          workflow_id?: string | null
          workflow_name: string
        }
        Update: {
          approvals_data?: Json | null
          comment?: string | null
          created_at?: string | null
          file_id?: string | null
          file_name?: string
          file_path?: string
          from_state_id?: string | null
          from_state_name?: string
          id?: string
          org_id?: string
          performed_at?: string
          performed_by?: string | null
          performed_by_email?: string
          revision_after?: string | null
          revision_before?: string | null
          to_state_id?: string | null
          to_state_name?: string
          transition_id?: string | null
          transition_name?: string | null
          workflow_id?: string | null
          workflow_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_history_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_history_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_history_from_state_id_fkey"
            columns: ["from_state_id"]
            isOneToOne: false
            referencedRelation: "workflow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_history_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_history_to_state_id_fkey"
            columns: ["to_state_id"]
            isOneToOne: false
            referencedRelation: "workflow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_history_transition_id_fkey"
            columns: ["transition_id"]
            isOneToOne: false
            referencedRelation: "workflow_transition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_history_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_template"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_review_history: {
        Row: {
          checklist_responses: Json | null
          comment: string | null
          created_at: string | null
          decision: string
          file_id: string | null
          file_name: string
          file_path: string
          from_state_name: string
          gate_id: string | null
          gate_name: string
          id: string
          org_id: string
          requested_at: string
          requested_by: string | null
          requested_by_email: string
          reviewed_at: string
          reviewed_by: string | null
          reviewed_by_email: string
          to_state_name: string
          transition_id: string | null
          workflow_id: string | null
          workflow_name: string
        }
        Insert: {
          checklist_responses?: Json | null
          comment?: string | null
          created_at?: string | null
          decision: string
          file_id?: string | null
          file_name: string
          file_path: string
          from_state_name: string
          gate_id?: string | null
          gate_name: string
          id?: string
          org_id: string
          requested_at: string
          requested_by?: string | null
          requested_by_email: string
          reviewed_at: string
          reviewed_by?: string | null
          reviewed_by_email: string
          to_state_name: string
          transition_id?: string | null
          workflow_id?: string | null
          workflow_name: string
        }
        Update: {
          checklist_responses?: Json | null
          comment?: string | null
          created_at?: string | null
          decision?: string
          file_id?: string | null
          file_name?: string
          file_path?: string
          from_state_name?: string
          gate_id?: string | null
          gate_name?: string
          id?: string
          org_id?: string
          requested_at?: string
          requested_by?: string | null
          requested_by_email?: string
          reviewed_at?: string
          reviewed_by?: string | null
          reviewed_by_email?: string
          to_state_name?: string
          transition_id?: string | null
          workflow_id?: string | null
          workflow_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_review_history_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_review_history_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "part_with_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_review_history_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "workflow_gate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_review_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_review_history_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_review_history_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_review_history_transition_id_fkey"
            columns: ["transition_id"]
            isOneToOne: false
            referencedRelation: "workflow_transition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_review_history_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_template"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_role: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          sort_order: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_role_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_role_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_role_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_state: {
        Row: {
          border_color: string | null
          border_opacity: number | null
          border_thickness: number | null
          color: string | null
          corner_radius: number | null
          created_at: string | null
          description: string | null
          fill_opacity: number | null
          gate_config: Json | null
          height: number
          icon: string | null
          id: string
          is_checkout_required: boolean | null
          is_editable: boolean | null
          is_review_stage: boolean | null
          is_revision_auto_incremented: boolean | null
          label: string | null
          name: string
          position_x: number | null
          position_y: number | null
          required_workflow_roles: string[] | null
          review_approved_state_id: string | null
          shape: Database["public"]["Enums"]["state_shape"] | null
          sort_order: number | null
          state_type: Database["public"]["Enums"]["state_type"] | null
          width: number
          workflow_id: string
        }
        Insert: {
          border_color?: string | null
          border_opacity?: number | null
          border_thickness?: number | null
          color?: string | null
          corner_radius?: number | null
          created_at?: string | null
          description?: string | null
          fill_opacity?: number | null
          gate_config?: Json | null
          height?: number
          icon?: string | null
          id?: string
          is_checkout_required?: boolean | null
          is_editable?: boolean | null
          is_review_stage?: boolean | null
          is_revision_auto_incremented?: boolean | null
          label?: string | null
          name: string
          position_x?: number | null
          position_y?: number | null
          required_workflow_roles?: string[] | null
          review_approved_state_id?: string | null
          shape?: Database["public"]["Enums"]["state_shape"] | null
          sort_order?: number | null
          state_type?: Database["public"]["Enums"]["state_type"] | null
          width?: number
          workflow_id: string
        }
        Update: {
          border_color?: string | null
          border_opacity?: number | null
          border_thickness?: number | null
          color?: string | null
          corner_radius?: number | null
          created_at?: string | null
          description?: string | null
          fill_opacity?: number | null
          gate_config?: Json | null
          height?: number
          icon?: string | null
          id?: string
          is_checkout_required?: boolean | null
          is_editable?: boolean | null
          is_review_stage?: boolean | null
          is_revision_auto_incremented?: boolean | null
          label?: string | null
          name?: string
          position_x?: number | null
          position_y?: number | null
          required_workflow_roles?: string[] | null
          review_approved_state_id?: string | null
          shape?: Database["public"]["Enums"]["state_shape"] | null
          sort_order?: number | null
          state_type?: Database["public"]["Enums"]["state_type"] | null
          width?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_state_review_approved_state_id_fkey"
            columns: ["review_approved_state_id"]
            isOneToOne: false
            referencedRelation: "workflow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_state_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_template"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template: {
        Row: {
          canvas_config: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          org_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          canvas_config?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          org_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          canvas_config?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          org_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_transition: {
        Row: {
          allowed_workflow_roles: string[] | null
          auto_conditions: Json | null
          created_at: string | null
          description: string | null
          end_edge: Database["public"]["Enums"]["transition_edge"] | null
          end_fraction: number | null
          from_state_id: string
          id: string
          label_offset: Json | null
          label_pinned: Json | null
          line_arrow_head:
            | Database["public"]["Enums"]["transition_arrow_head"]
            | null
          line_color: string | null
          line_path_type:
            | Database["public"]["Enums"]["transition_path_type"]
            | null
          line_style:
            | Database["public"]["Enums"]["transition_line_style"]
            | null
          line_thickness: number | null
          name: string | null
          start_edge: Database["public"]["Enums"]["transition_edge"] | null
          start_fraction: number | null
          to_state_id: string
          waypoints: Json
          workflow_id: string
        }
        Insert: {
          allowed_workflow_roles?: string[] | null
          auto_conditions?: Json | null
          created_at?: string | null
          description?: string | null
          end_edge?: Database["public"]["Enums"]["transition_edge"] | null
          end_fraction?: number | null
          from_state_id: string
          id?: string
          label_offset?: Json | null
          label_pinned?: Json | null
          line_arrow_head?:
            | Database["public"]["Enums"]["transition_arrow_head"]
            | null
          line_color?: string | null
          line_path_type?:
            | Database["public"]["Enums"]["transition_path_type"]
            | null
          line_style?:
            | Database["public"]["Enums"]["transition_line_style"]
            | null
          line_thickness?: number | null
          name?: string | null
          start_edge?: Database["public"]["Enums"]["transition_edge"] | null
          start_fraction?: number | null
          to_state_id: string
          waypoints?: Json
          workflow_id: string
        }
        Update: {
          allowed_workflow_roles?: string[] | null
          auto_conditions?: Json | null
          created_at?: string | null
          description?: string | null
          end_edge?: Database["public"]["Enums"]["transition_edge"] | null
          end_fraction?: number | null
          from_state_id?: string
          id?: string
          label_offset?: Json | null
          label_pinned?: Json | null
          line_arrow_head?:
            | Database["public"]["Enums"]["transition_arrow_head"]
            | null
          line_color?: string | null
          line_path_type?:
            | Database["public"]["Enums"]["transition_path_type"]
            | null
          line_style?:
            | Database["public"]["Enums"]["transition_line_style"]
            | null
          line_thickness?: number | null
          name?: string | null
          start_edge?: Database["public"]["Enums"]["transition_edge"] | null
          start_fraction?: number | null
          to_state_id?: string
          waypoints?: Json
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_transition_from_state_id_fkey"
            columns: ["from_state_id"]
            isOneToOne: false
            referencedRelation: "workflow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_transition_to_state_id_fkey"
            columns: ["to_state_id"]
            isOneToOne: false
            referencedRelation: "workflow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_transition_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_template"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      part_with_pricing: {
        Row: {
          created_at: string | null
          description: string | null
          file_name: string | null
          file_path: string | null
          file_type: Database["public"]["Enums"]["file_type"] | null
          id: string | null
          lowest_price: number | null
          org_id: string | null
          part_number: string | null
          preferred_supplier: Json | null
          revision: string | null
          state: string | null
          supplier_count: number | null
          updated_at: string | null
          vault_id: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          file_type?: Database["public"]["Enums"]["file_type"] | null
          id?: string | null
          lowest_price?: never
          org_id?: string | null
          part_number?: string | null
          preferred_supplier?: never
          revision?: string | null
          state?: string | null
          supplier_count?: never
          updated_at?: string | null
          vault_id?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          file_type?: Database["public"]["Enums"]["file_type"] | null
          id?: string | null
          lowest_price?: never
          org_id?: string | null
          part_number?: string | null
          preferred_supplier?: never
          revision?: string | null
          state?: string | null
          supplier_count?: never
          updated_at?: string | null
          vault_id?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "file_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "vault"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_recovery_code_use: {
        Args: { p_code: string; p_ip_address?: string }
        Returns: Json
      }
      anon_enforce_execute_posture: { Args: never; Returns: number }
      anon_get_execute_allowlist: {
        Args: never
        Returns: {
          reason: string
          signature: string
        }[]
      }
      anon_get_read_allowlist: {
        Args: never
        Returns: {
          reason: string
          relname: string
        }[]
      }
      anon_list_admitting_policies: {
        Args: { p_oid: unknown }
        Returns: string[]
      }
      anon_list_read_grantors: { Args: { p_oid: unknown }; Returns: string[] }
      anon_list_revoke_grantors: { Args: { p_oid: unknown }; Returns: string[] }
      backup_get_status: { Args: never; Returns: Json }
      bom_calculate_cost: {
        Args: { p_assembly_id: string; p_quantity?: number }
        Returns: {
          assembly_id: string
          assembly_name: string
          assembly_part_number: string
          component_count: number
          currency: string
          missing_pricing_count: number
          total_cost: number
        }[]
      }
      can_access_module: {
        Args: { p_module_id: string; p_user_id?: string }
        Returns: boolean
      }
      can_access_vault: { Args: { p_vault_id: string }; Returns: boolean }
      can_read_vault_object: { Args: { p_name: string }; Returns: boolean }
      can_review_gate: {
        Args: { p_gate_id: string; p_user_id: string }
        Returns: boolean
      }
      can_run_transition: {
        Args: { p_transition_id: string; p_user_id: string }
        Returns: boolean
      }
      can_user_access_vault: {
        Args: { p_user_id: string; p_vault_id: string }
        Returns: boolean
      }
      check_anon_reach: {
        Args: never
        Returns: {
          detail: string
          identity: string
          kind: string
          severity: string
        }[]
      }
      check_definer_search_path: {
        Args: never
        Returns: {
          detail: string
          signature: string
        }[]
      }
      check_gate_requirements: {
        Args: { p_eco_id: string; p_gate_name: string }
        Returns: {
          all_required_complete: boolean
          completed_items: number
          incomplete_items: string[]
          required_items: number
        }[]
      }
      check_null_unsafe_org_gates: {
        Args: never
        Returns: {
          detail: string
          signature: string
        }[]
      }
      check_org_gates: {
        Args: never
        Returns: {
          detail: string
          signature: string
          status: string
        }[]
      }
      check_release_residue: {
        Args: never
        Returns: {
          detail: string
          identity: string
          residue: string
        }[]
      }
      check_schema_release: {
        Args: never
        Returns: {
          detail: string
          identity: string
          module: string
          status: string
        }[]
      }
      check_unbound_entity_args: {
        Args: never
        Returns: {
          detail: string
          signature: string
        }[]
      }
      check_withdrawn_execute: {
        Args: never
        Returns: {
          detail: string
          module: string
          signature: string
          status: string
        }[]
      }
      client_min_version: { Args: never; Returns: string }
      custom_properties_merge: {
        Args: { p_existing: Json; p_incoming: Json }
        Returns: Json
      }
      customer_analytics_summary: {
        Args: { p_from: string; p_org_id: string; p_to: string }
        Returns: {
          active_customers: number
          aov: number
          at_risk_customers: number
          buyers: number
          churned_customers: number
          discount: number
          gone_customers: number
          new_customers: number
          orders: number
          prev_aov: number
          prev_buyers: number
          prev_discount: number
          prev_new_customers: number
          prev_orders: number
          prev_revenue: number
          prev_units: number
          revenue: number
          segment_counts: Json
          total_customers: number
          unclassified_accounts: number
          units: number
        }[]
      }
      customer_category_breakdown: {
        Args: { p_from: string; p_org_id: string; p_to: string }
        Returns: {
          buyers: number
          category: string
          category_label: string
          orders: number
          revenue: number
          subcategory: string
          subcategory_label: string
        }[]
      }
      customer_channel_counts: {
        Args: { p_from: string; p_org_id: string; p_to: string }
        Returns: {
          account_count: number
          channel: string
          customer_count: number
          orders: number
          revenue: number
        }[]
      }
      customer_cohort_retention: {
        Args: { p_as_of: string; p_months?: number; p_org_id: string }
        Returns: {
          buyers: number
          cohort_month: string
          cohort_size: number
          month_index: number
          retention: number
          revenue: number
        }[]
      }
      customer_detail: {
        Args: {
          p_customer_id: string
          p_from: string
          p_order_limit?: number
          p_to: string
        }
        Returns: Json
      }
      customer_geo_breakdown: {
        Args: { p_from: string; p_org_id: string; p_to: string }
        Returns: {
          buyers: number
          country: string
          orders: number
          revenue: number
        }[]
      }
      customer_lifecycle_segment: {
        Args: {
          p_as_of: string
          p_first_order: string
          p_last_order: string
          p_order_count: number
        }
        Returns: string
      }
      customer_non_revenue_statuses: { Args: never; Returns: string[] }
      customer_order_is_revenue: {
        Args: { p_status: string }
        Returns: boolean
      }
      customer_partner_coverage: {
        Args: { p_from: string; p_org_id: string; p_to: string }
        Returns: {
          account_id: string
          account_key: string
          account_name: string
          channel: string
          contacts: number
          country: string
          last_order_date: string
          name: string
          partner_channel: string
          total_spent: number
          website: string
        }[]
      }
      customer_revenue_timeseries: {
        Args: {
          p_bucket?: string
          p_from: string
          p_org_id: string
          p_to: string
        }
        Returns: {
          bucket_start: string
          buyers: number
          new_customers: number
          orders: number
          revenue: number
          units: number
        }[]
      }
      customer_rfm: {
        Args: {
          p_from: string
          p_limit?: number
          p_org_id: string
          p_to: string
        }
        Returns: {
          account_id: string
          account_name: string
          category: string
          category_label: string
          channel: string
          city: string
          country: string
          customer_id: string
          email: string
          f_score: number
          first_order_date: string
          is_active: boolean
          last_order_date: string
          lifetime_orders: number
          m_score: number
          name: string
          order_count: number
          r_score: number
          recency_days: number
          segment: string
          subcategory: string
          total_spent: number
        }[]
      }
      customer_segment_counts: {
        Args: { p_as_of?: string; p_org_id: string }
        Returns: {
          buyers: number
          revenue: number
          segment: string
        }[]
      }
      customer_top_accounts: {
        Args: {
          p_from: string
          p_limit?: number
          p_org_id: string
          p_to: string
        }
        Returns: {
          account_id: string
          buyers: number
          cumulative_share: number
          group_key: string
          label: string
          orders: number
          rank_index: number
          revenue: number
          share: number
        }[]
      }
      customer_top_products: {
        Args: {
          p_from: string
          p_limit?: number
          p_org_id: string
          p_to: string
        }
        Returns: {
          buyers: number
          orders: number
          product_erp_id: string
          product_key: string
          product_name: string
          quantity: number
          revenue: number
        }[]
      }
      customers_extension_schema_version: { Args: never; Returns: number }
      drawing_pdf_render_get: {
        Args: { p_file_version_id: string }
        Returns: {
          file_id: string
          file_size: number
          file_version_id: string
          generated_at: string
          generated_by: string
          is_closure_exact: boolean
          storage_hash: string
        }[]
      }
      drawing_pdf_render_record: {
        Args: {
          p_closure_exact?: boolean
          p_file_size: number
          p_file_version_id: string
          p_storage_hash: string
        }
        Returns: Json
      }
      eco_gate_approve: {
        Args: { p_eco_id: string; p_gate_name: string; p_notes?: string }
        Returns: Json
      }
      eco_require_access: { Args: { p_eco_id: string }; Returns: string }
      file_checkin: {
        Args: {
          p_comment?: string
          p_custom_properties?: Json
          p_description?: string
          p_file_id: string
          p_inspection_hash?: string
          p_local_active_version?: number
          p_new_content_hash?: string
          p_new_file_name?: string
          p_new_file_path?: string
          p_new_file_size?: number
          p_part_number?: string
          p_revision?: string
        }
        Returns: Json
      }
      file_checkout: {
        Args: {
          p_file_id: string
          p_lock_message?: string
          p_machine_id?: string
          p_machine_name?: string
        }
        Returns: Json
      }
      file_get_active_by_path: {
        Args: { p_file_path: string; p_vault_id: string }
        Returns: {
          checked_out_at: string | null
          checked_out_by: string | null
          checked_out_by_machine_id: string | null
          checked_out_by_machine_name: string | null
          checked_out_file_name: string | null
          checked_out_file_path: string | null
          configuration_revisions: Json | null
          content_hash: string | null
          created_at: string | null
          created_by: string
          custom_properties: Json | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          eco_tags: string[] | null
          extension: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: Database["public"]["Enums"]["file_type"]
          id: string
          inspection_hash: string | null
          lock_message: string | null
          org_id: string
          part_number: string | null
          revision: string
          state: string | null
          state_changed_at: string | null
          state_changed_by: string | null
          updated_at: string | null
          updated_by: string | null
          vault_id: string
          version: number
          workflow_state_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "file"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      file_get_legacy_state: { Args: { p_state_name: string }; Returns: string }
      file_move: {
        Args: {
          p_file_id: string
          p_new_file_name?: string
          p_new_file_path: string
        }
        Returns: Json
      }
      file_repair_config_maps: {
        Args: { p_org_id: string; p_repairs: Json }
        Returns: Json
      }
      file_require_access: { Args: { p_file_id: string }; Returns: string }
      file_share_link_admit: {
        Args: { p_token: string }
        Returns: {
          error_message: string
          file_id: string
          file_version: number
          is_valid: boolean
          org_id: string
        }[]
      }
      file_share_link_consume: { Args: { p_token: string }; Returns: boolean }
      file_share_link_create: {
        Args: {
          p_created_by: string
          p_expires_in_days?: number
          p_file_id: string
          p_max_downloads?: number
          p_org_id: string
          p_require_auth?: boolean
        }
        Returns: {
          expires_at: string
          link_id: string
          token: string
        }[]
      }
      file_share_link_generate_token: { Args: never; Returns: string }
      file_share_link_remediate_cross_tenant: { Args: never; Returns: number }
      file_share_link_validate: {
        Args: { p_token: string }
        Returns: {
          error_message: string
          file_id: string
          file_version: number
          is_valid: boolean
          org_id: string
        }[]
      }
      file_version_get_dependency_closure: {
        Args: { p_file_version_id: string }
        Returns: {
          configuration: string
          content_hash: string
          deleted: boolean
          depth: number
          edge_source: string
          extension: string
          file_id: string
          file_name: string
          file_path: string
          file_size: number
          file_version_id: string
          is_exact: boolean
          missing: boolean
          parent_version_id: string
          quantity: number
          reference_path: string
          reference_type: string
          revision: string
          vault_id: string
          version: number
        }[]
      }
      file_version_reference_list_edges: {
        Args: { p_org_id: string; p_parent_version_ids: string[] }
        Returns: {
          child_file_id: string
          child_path: string
          child_version_id: string
          configuration: string
          edge_source: string
          is_exact: boolean
          parent_version_id: string
          quantity: number
          reference_type: string
        }[]
      }
      file_version_reference_record: {
        Args: { p_file_version_id: string; p_refs: Json }
        Returns: Json
      }
      folder_remediate_case_collisions: { Args: never; Returns: number }
      folder_rename: {
        Args: {
          p_new_folder_path: string
          p_old_folder_path: string
          p_vault_id?: string
        }
        Returns: Json
      }
      gate_review_complete: {
        Args: {
          p_checklist_responses?: Json
          p_comment?: string
          p_decision: Database["public"]["Enums"]["review_status"]
          p_pending_review_id: string
        }
        Returns: Json
      }
      gate_review_list_awaiting_ids: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      gate_review_list_mine: {
        Args: never
        Returns: {
          checklist_items: Json
          file_id: string
          file_name: string
          file_path: string
          from_state_name: string
          gate_id: string
          gate_name: string
          gate_type: Database["public"]["Enums"]["gate_type"]
          requested_at: string
          requested_by: string
          requested_by_email: string
          review_id: string
          to_state_name: string
          transition_id: string
          transition_name: string
        }[]
      }
      gate_reviewer_list_user_ids: {
        Args: { p_gate_id: string; p_org_id: string }
        Returns: string[]
      }
      has_team_permission: {
        Args: {
          p_action: Database["public"]["Enums"]["permission_action"]
          p_resource: string
          p_vault_id?: string
        }
        Returns: boolean
      }
      has_user_permission: {
        Args: {
          p_action: Database["public"]["Enums"]["permission_action"]
          p_resource: string
          p_user_id: string
          p_vault_id?: string
        }
        Returns: boolean
      }
      is_org_admin:
        | { Args: never; Returns: boolean }
        | { Args: { p_user_id: string }; Returns: boolean }
      is_org_file_workflows_enabled: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      is_org_gate_status_blocking: {
        Args: { p_status: string }
        Returns: boolean
      }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      item_designation_assignment_list: {
        Args: { p_org_id: string; p_vault_id: string }
        Returns: {
          designation_id: string
          id: string
          org_id: string
          part_number: string
          updated_at: string | null
          updated_by: string | null
          vault_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "item_designation_assignment"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      item_designation_assignment_set: {
        Args: {
          p_designation_id?: string
          p_org_id: string
          p_part_number: string
          p_vault_id: string
        }
        Returns: {
          designation_id: string
          id: string
          org_id: string
          part_number: string
          updated_at: string | null
          updated_by: string | null
          vault_id: string
        }
        SetofOptions: {
          from: "*"
          to: "item_designation_assignment"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      item_designation_delete: {
        Args: { p_id: string; p_org_id: string }
        Returns: boolean
      }
      item_designation_list: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          org_id: string
          sort_order: number
        }[]
        SetofOptions: {
          from: "*"
          to: "item_designation"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      item_designation_upsert: {
        Args: {
          p_id?: string
          p_name: string
          p_org_id: string
          p_sort_order?: number
        }
        Returns: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          org_id: string
          sort_order: number
        }
        SetofOptions: {
          from: "*"
          to: "item_designation"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      item_image_list: {
        Args: { p_org_id: string }
        Returns: {
          icon_color: string | null
          icon_name: string | null
          id: string
          image_storage_path: string | null
          image_type: string
          org_id: string
          part_number: string
          updated_at: string | null
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "item_image"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      item_image_reset: {
        Args: { p_org_id: string; p_part_number: string }
        Returns: boolean
      }
      item_image_upsert: {
        Args: {
          p_icon_color?: string
          p_icon_name?: string
          p_image_storage_path?: string
          p_image_type: string
          p_org_id: string
          p_part_number: string
        }
        Returns: {
          icon_color: string | null
          icon_name: string | null
          id: string
          image_storage_path: string | null
          image_type: string
          org_id: string
          part_number: string
          updated_at: string | null
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "item_image"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      job_title_create_defaults: {
        Args: { p_created_by?: string; p_org_id: string }
        Returns: undefined
      }
      known_partner_channel_for_key: {
        Args: { p_account_key: string }
        Returns: string
      }
      known_partners: {
        Args: never
        Returns: {
          account_keys: string[]
          channel: string
          country: string
          name: string
          website: string
        }[]
      }
      like_pattern_escape: { Args: { p_text: string }; Returns: string }
      module_access_get_config: {
        Args: never
        Returns: {
          module_id: string
          team_id: string
          user_id: string
        }[]
      }
      module_access_set: {
        Args: {
          p_module_id: string
          p_team_ids?: string[]
          p_user_ids?: string[]
        }
        Returns: Json
      }
      module_list_denied: { Args: never; Returns: string[] }
      my_accessible_vault_ids: { Args: never; Returns: string[] }
      my_actor_id: { Args: never; Returns: string }
      my_solidworks_license_ids: { Args: never; Returns: string[] }
      my_verified_email: { Args: never; Returns: string }
      odoo_saved_config_list: {
        Args: { p_org_id: string }
        Returns: {
          color: string
          created_at: string
          database: string
          description: string
          id: string
          is_active: boolean
          is_last_test_successful: boolean
          last_tested_at: string
          name: string
          url: string
        }[]
      }
      org_force_column_defaults: {
        Args: { p_column_defaults: Json; p_org_id: string }
        Returns: Json
      }
      org_force_module_defaults: {
        Args: {
          p_custom_groups?: Json
          p_dividers: Json
          p_enabled_groups: Json
          p_enabled_modules: Json
          p_module_icon_colors?: Json
          p_module_order: Json
          p_module_parents?: Json
          p_org_id: string
        }
        Returns: Json
      }
      org_gate_get_exclusion_reason: {
        Args: { p_oid: unknown }
        Returns: string
      }
      org_get_auth_providers: { Args: { p_org_slug: string }; Returns: Json }
      org_get_column_defaults: { Args: { p_org_id: string }; Returns: Json }
      org_get_google_drive_settings: {
        Args: { p_org_id: string }
        Returns: {
          client_id: string
          client_secret: string
          inspection_template_folder_id: string
          is_enabled: boolean
        }[]
      }
      org_get_item_definition_settings: {
        Args: { p_org_id: string }
        Returns: Json
      }
      org_get_module_defaults: { Args: { p_org_id: string }; Returns: Json }
      org_integration_get_status: {
        Args: { p_integration_type: string; p_org_id: string }
        Returns: {
          id: string
          integration_type: string
          is_active: boolean
          is_auto_sync: boolean
          is_connected: boolean
          last_connected_at: string
          last_sync_at: string
          last_sync_count: number
          last_sync_status: string
        }[]
      }
      org_join_by_slug: { Args: { p_org_slug: string }; Returns: Json }
      org_regenerate_slug: { Args: never; Returns: Json }
      org_remove_user: { Args: { p_user_email: string }; Returns: Json }
      org_require_member: { Args: { p_org_id: string }; Returns: undefined }
      org_rpc_revoke_public_execute: { Args: never; Returns: number }
      org_set_column_defaults: {
        Args: { p_column_defaults: Json; p_org_id: string }
        Returns: Json
      }
      org_set_module_defaults: {
        Args: {
          p_custom_groups?: Json
          p_dividers: Json
          p_enabled_groups: Json
          p_enabled_modules: Json
          p_module_icon_colors?: Json
          p_module_order: Json
          p_module_parents?: Json
          p_org_id: string
        }
        Returns: Json
      }
      org_update_branding: {
        Args: {
          p_contact_email?: string
          p_logo_storage_path?: string
          p_logo_url?: string
          p_org_id: string
          p_phone?: string
          p_website?: string
        }
        Returns: Json
      }
      org_update_google_drive_settings: {
        Args: {
          p_client_id: string
          p_client_secret: string
          p_enabled: boolean
          p_inspection_template_folder_id?: string
          p_org_id: string
        }
        Returns: boolean
      }
      org_update_item_definition_settings: {
        Args: { p_org_id: string; p_settings: Json }
        Returns: boolean
      }
      org_update_serialization_settings: {
        Args: { p_org_id: string; p_settings: Json }
        Returns: boolean
      }
      part_supplier_get_best_price: {
        Args: { p_file_id: string; p_quantity?: number }
        Returns: {
          currency: string
          is_preferred: boolean
          lead_time_days: number
          supplier_code: string
          supplier_id: string
          supplier_name: string
          supplier_part_number: string
          total_price: number
          unit_price: number
        }[]
      }
      pending_license_assignment_add: {
        Args: { p_license_id: string; p_pending_member_id: string }
        Returns: Json
      }
      pending_license_assignment_apply: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      pending_license_assignment_remove: {
        Args: { p_license_id: string; p_pending_member_id: string }
        Returns: Json
      }
      probe_get_literal: { Args: { p_type: string }; Returns: string }
      probe_get_literal_for_arg: {
        Args: { p_arg: string; p_oid: unknown; p_type: string }
        Returns: string
      }
      process_template_instantiate: {
        Args: { p_eco_id: string; p_template_id: string }
        Returns: undefined
      }
      review_advance_files: {
        Args: { p_only_approved?: boolean; p_review_id: string }
        Returns: Json
      }
      review_advance_items: {
        Args: { p_only_approved: boolean; p_review_id: string }
        Returns: Json
      }
      review_apply_workflow_after_settle: {
        Args: { p_review_id: string; p_status: string }
        Returns: undefined
      }
      review_approve_all_remaining: {
        Args: { p_comment?: string; p_review_id: string }
        Returns: Json
      }
      review_cancel: {
        Args: { p_reason?: string; p_review_id: string }
        Returns: Json
      }
      review_count_badge: { Args: never; Returns: number }
      review_get_detail: { Args: { p_review_id: string }; Returns: Json }
      review_get_display_title: {
        Args: { p_review_id: string }
        Returns: string
      }
      review_get_user_json: { Args: { p_user_id: string }; Returns: Json }
      review_get_workflow_status: {
        Args: { p_review_id: string }
        Returns: Json
      }
      review_item_add: {
        Args: { p_file_version_ids: string[]; p_review_id: string }
        Returns: Json
      }
      review_item_list_owed_ids: {
        Args: { p_review_id: string; p_user_id: string }
        Returns: string[]
      }
      review_item_remove: {
        Args: { p_file_ids: string[]; p_review_id: string }
        Returns: Json
      }
      review_item_respond: {
        Args: { p_decisions: Json; p_review_id: string }
        Returns: Json
      }
      review_list_open_for_files: {
        Args: { p_file_ids?: string[] }
        Returns: Json
      }
      review_list_queue: {
        Args: {
          p_bucket?: string
          p_cursor?: string
          p_limit?: number
          p_search?: string
          p_team_id?: string
        }
        Returns: Json
      }
      review_notify: {
        Args: {
          p_actor: string
          p_message: string
          p_org_id: string
          p_priority?: string
          p_recipients: string[]
          p_review_id: string
          p_title: string
          p_type: string
        }
        Returns: number
      }
      review_notify_overdue: { Args: never; Returns: number }
      review_priority_get_rank: {
        Args: { p_priority: string }
        Returns: number
      }
      review_request: {
        Args: {
          p_due_date?: string
          p_file_version_ids: string[]
          p_message?: string
          p_mode?: string
          p_priority?: string
          p_reviewer_ids?: string[]
          p_team_ids?: string[]
          p_title?: string
        }
        Returns: Json
      }
      review_require_access: { Args: { p_review_id: string }; Returns: string }
      review_resubmit: {
        Args: { p_items: Json; p_note?: string; p_review_id: string }
        Returns: Json
      }
      review_settle: {
        Args: { p_actor: string; p_notify?: boolean; p_review_id: string }
        Returns: string
      }
      review_stage_get_exit_transition: {
        Args: { p_state_id: string }
        Returns: string
      }
      review_status_get_label: {
        Args: { p_status: Database["public"]["Enums"]["review_status"] }
        Returns: string
      }
      review_update_meta: {
        Args: {
          p_clear_due_date?: boolean
          p_due_date?: string
          p_priority?: string
          p_review_id: string
        }
        Returns: Json
      }
      review_withdraw_lost_reviewers: { Args: never; Returns: number }
      revision_get_next: {
        Args: {
          p_current: string
          p_scheme: Database["public"]["Enums"]["revision_scheme"]
        }
        Returns: string
      }
      rfq_generate_number: { Args: { p_org_id: string }; Returns: string }
      routine_list_row_selecting_id_args: {
        Args: { p_oid: unknown }
        Returns: string[]
      }
      schema_get_release_manifest: {
        Args: never
        Returns: {
          identity: string
          kind: string
          module: string
          probe: string
          requires: string
        }[]
      }
      schema_get_withdrawn_execute_manifest: {
        Args: never
        Returns: {
          module: string
          signature: string
        }[]
      }
      schema_release_description: { Args: never; Returns: string }
      schema_release_version: { Args: never; Returns: number }
      schema_remediation_record: {
        Args: {
          p_detail: string
          p_name: string
          p_rows: number
          p_subjects: Json
        }
        Returns: number
      }
      schema_stamp_quiet: { Args: never; Returns: undefined }
      schema_version_update: {
        Args: { new_description?: string; new_version: number }
        Returns: undefined
      }
      seed_customer_categories: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      seed_known_partners: { Args: { p_org_id: string }; Returns: number }
      serial_number_get_next: { Args: { p_org_id: string }; Returns: string }
      serial_number_preview_next: {
        Args: { p_org_id: string }
        Returns: string
      }
      solidworks_license_activate: {
        Args: {
          p_assignment_id: string
          p_machine_id: string
          p_machine_name?: string
        }
        Returns: Json
      }
      solidworks_license_assign: {
        Args: { p_license_id: string; p_user_id: string }
        Returns: Json
      }
      solidworks_license_deactivate: {
        Args: { p_assignment_id: string }
        Returns: Json
      }
      solidworks_license_unassign: {
        Args: { p_assignment_id: string }
        Returns: Json
      }
      sql_strip_noise: { Args: { p_src: string }; Returns: string }
      team_clear_module_defaults: { Args: { p_team_id: string }; Returns: Json }
      team_create_defaults: {
        Args: { p_created_by?: string; p_org_id: string }
        Returns: undefined
      }
      team_get_module_defaults: { Args: { p_team_id: string }; Returns: Json }
      team_member_apply_pending: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      team_reviewer_list_user_ids: {
        Args: { p_team_id: string }
        Returns: string[]
      }
      team_set_module_defaults: {
        Args: {
          p_custom_groups?: Json
          p_dividers: Json
          p_enabled_groups: Json
          p_enabled_modules: Json
          p_module_icon_colors?: Json
          p_module_order: Json
          p_module_parents?: Json
          p_team_id: string
        }
        Returns: Json
      }
      user_block: {
        Args: { p_email: string; p_reason?: string }
        Returns: Json
      }
      user_delete_account: { Args: never; Returns: Json }
      user_ensure_org_id: { Args: never; Returns: Json }
      user_get_column_defaults: { Args: never; Returns: Json }
      user_get_effective_role: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      user_get_module_defaults: { Args: { p_user_id?: string }; Returns: Json }
      user_get_verified_email: { Args: { p_user_id: string }; Returns: string }
      user_permission_list: {
        Args: { p_user_id: string; p_vault_id?: string }
        Returns: {
          actions: Database["public"]["Enums"]["permission_action"][]
          resource: string
          vault_id: string
        }[]
      }
      user_require_same_org: { Args: { p_user_id: string }; Returns: undefined }
      user_set_column_defaults: {
        Args: { p_column_defaults: Json }
        Returns: Json
      }
      user_unblock: { Args: { p_email: string }; Returns: Json }
      user_update_avatar: {
        Args: { p_avatar_storage_path?: string; p_custom_avatar_url?: string }
        Returns: Json
      }
      user_update_last_online: { Args: never; Returns: Json }
      user_vault_access_list: {
        Args: { p_user_id: string }
        Returns: {
          vault_id: string
        }[]
      }
      vault_file_count: {
        Args: { p_org_id: string; p_vault_id?: string }
        Returns: number
      }
      vault_file_list: {
        Args: { p_org_id: string; p_vault_id?: string }
        Returns: {
          checked_out_at: string
          checked_out_by: string
          checked_out_file_name: string
          checked_out_file_path: string
          content_hash: string
          custom_properties: Json
          description: string
          extension: string
          file_name: string
          file_path: string
          file_size: number
          file_type: Database["public"]["Enums"]["file_type"]
          id: string
          part_number: string
          revision: string
          state: string
          updated_at: string
          version: number
        }[]
      }
      vault_file_list_delta: {
        Args: { p_org_id: string; p_since: string; p_vault_id: string }
        Returns: {
          checked_out_at: string
          checked_out_by: string
          checked_out_file_name: string
          checked_out_file_path: string
          content_hash: string
          custom_properties: Json
          deleted_at: string
          description: string
          extension: string
          file_name: string
          file_path: string
          file_size: number
          file_type: Database["public"]["Enums"]["file_type"]
          id: string
          is_deleted: boolean
          part_number: string
          revision: string
          state: string
          updated_at: string
          version: number
        }[]
      }
      vault_require_access: { Args: { p_vault_id: string }; Returns: string }
      verify_and_stamp_schema: { Args: never; Returns: Json }
      webhook_list_for_event: {
        Args: {
          p_event_type: Database["public"]["Enums"]["webhook_event"]
          p_org_id: string
        }
        Returns: {
          created_at: string | null
          created_by: string | null
          custom_headers: Json
          description: string | null
          events: Database["public"]["Enums"]["webhook_event"][]
          failure_count: number | null
          id: string
          is_active: boolean
          last_triggered_at: string | null
          max_retries: number
          name: string
          org_id: string
          retry_delay_seconds: number
          secret: string
          success_count: number | null
          timeout_seconds: number
          trigger_filter: string
          trigger_roles: string[]
          trigger_user_ids: string[]
          updated_at: string | null
          updated_by: string | null
          url: string
        }[]
        SetofOptions: {
          from: "*"
          to: "webhook"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      workflow_create_default: { Args: { p_org_id: string }; Returns: string }
      workflow_history_remediate_cross_tenant: { Args: never; Returns: number }
      workflow_import_graph: {
        Args: { p_payload: Json; p_workflow_id: string }
        Returns: Json
      }
      workflow_transition_apply: {
        Args: {
          p_approvals: Json
          p_comment: string
          p_file_id: string
          p_transition_id: string
        }
        Returns: Json
      }
      workflow_transition_execute: {
        Args: { p_comment?: string; p_file_id: string; p_transition_id: string }
        Returns: Json
      }
      workflow_transition_execute_to_legacy_state: {
        Args: { p_comment?: string; p_file_id: string; p_target_state: string }
        Returns: Json
      }
      workflow_transition_list_available: {
        Args: { p_file_id: string }
        Returns: {
          has_gates: boolean
          to_state_color: string
          to_state_id: string
          to_state_name: string
          transition_id: string
          transition_name: string
          user_can_transition: boolean
        }[]
      }
    }
    Enums: {
      activity_action:
        | "create"
        | "update"
        | "checkout"
        | "checkin"
        | "state_change"
        | "revision_change"
        | "delete"
        | "restore"
        | "move"
        | "rename"
      address_type: "billing" | "shipping"
      approval_mode: "any" | "all" | "majority"
      checklist_item_status:
        | "not_started"
        | "in_progress"
        | "complete"
        | "blocked"
        | "na"
      deviation_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "closed"
        | "expired"
      eco_status: "open" | "in_progress" | "completed" | "cancelled"
      file_state: "not_tracked" | "wip" | "in_review" | "released" | "obsolete"
      file_type: "part" | "assembly" | "drawing" | "pdf" | "step" | "other"
      gate_type: "approval" | "checklist" | "condition"
      metadata_column_type: "text" | "number" | "date" | "boolean" | "select"
      permission_action: "view" | "create" | "edit" | "delete" | "admin"
      reference_type: "component" | "derived" | "reference"
      release_file_type:
        | "step"
        | "pdf"
        | "dxf"
        | "iges"
        | "stl"
        | "dwg"
        | "dxf_flat"
      review_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "kicked_back"
      reviewer_type: "user" | "role" | "group" | "workflow_role"
      revision_scheme: "letter" | "numeric"
      rfq_status:
        | "draft"
        | "pending_files"
        | "generating"
        | "ready"
        | "sent"
        | "awaiting_quote"
        | "quoted"
        | "awarded"
        | "cancelled"
        | "completed"
      solidworks_license_type: "standalone" | "network"
      state_shape: "rectangle" | "diamond" | "hexagon" | "ellipse"
      state_type: "state" | "gate"
      supplier_auth_method: "email" | "phone" | "wechat"
      transition_arrow_head: "none" | "end" | "start" | "both"
      transition_edge: "left" | "right" | "top" | "bottom"
      transition_line_style: "solid" | "dashed" | "dotted"
      transition_path_type: "straight" | "spline" | "elbow"
      user_role: "admin" | "engineer" | "viewer"
      webhook_delivery_status: "pending" | "success" | "failed" | "retrying"
      webhook_event:
        | "file.created"
        | "file.updated"
        | "file.deleted"
        | "file.checked_in"
        | "file.checked_out"
        | "file.state_changed"
        | "file.revision_changed"
        | "eco.created"
        | "eco.updated"
        | "eco.completed"
        | "review.requested"
        | "review.approved"
        | "review.rejected"
        | "rfq.created"
        | "rfq.sent"
        | "rfq.quoted"
        | "rfq.awarded"
        | "supplier.created"
        | "supplier.updated"
      workflow_state_type: "initial" | "intermediate" | "final" | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_action: [
        "create",
        "update",
        "checkout",
        "checkin",
        "state_change",
        "revision_change",
        "delete",
        "restore",
        "move",
        "rename",
      ],
      address_type: ["billing", "shipping"],
      approval_mode: ["any", "all", "majority"],
      checklist_item_status: [
        "not_started",
        "in_progress",
        "complete",
        "blocked",
        "na",
      ],
      deviation_status: [
        "draft",
        "pending_approval",
        "approved",
        "rejected",
        "closed",
        "expired",
      ],
      eco_status: ["open", "in_progress", "completed", "cancelled"],
      file_state: ["not_tracked", "wip", "in_review", "released", "obsolete"],
      file_type: ["part", "assembly", "drawing", "pdf", "step", "other"],
      gate_type: ["approval", "checklist", "condition"],
      metadata_column_type: ["text", "number", "date", "boolean", "select"],
      permission_action: ["view", "create", "edit", "delete", "admin"],
      reference_type: ["component", "derived", "reference"],
      release_file_type: [
        "step",
        "pdf",
        "dxf",
        "iges",
        "stl",
        "dwg",
        "dxf_flat",
      ],
      review_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "kicked_back",
      ],
      reviewer_type: ["user", "role", "group", "workflow_role"],
      revision_scheme: ["letter", "numeric"],
      rfq_status: [
        "draft",
        "pending_files",
        "generating",
        "ready",
        "sent",
        "awaiting_quote",
        "quoted",
        "awarded",
        "cancelled",
        "completed",
      ],
      solidworks_license_type: ["standalone", "network"],
      state_shape: ["rectangle", "diamond", "hexagon", "ellipse"],
      state_type: ["state", "gate"],
      supplier_auth_method: ["email", "phone", "wechat"],
      transition_arrow_head: ["none", "end", "start", "both"],
      transition_edge: ["left", "right", "top", "bottom"],
      transition_line_style: ["solid", "dashed", "dotted"],
      transition_path_type: ["straight", "spline", "elbow"],
      user_role: ["admin", "engineer", "viewer"],
      webhook_delivery_status: ["pending", "success", "failed", "retrying"],
      webhook_event: [
        "file.created",
        "file.updated",
        "file.deleted",
        "file.checked_in",
        "file.checked_out",
        "file.state_changed",
        "file.revision_changed",
        "eco.created",
        "eco.updated",
        "eco.completed",
        "review.requested",
        "review.approved",
        "review.rejected",
        "rfq.created",
        "rfq.sent",
        "rfq.quoted",
        "rfq.awarded",
        "supplier.created",
        "supplier.updated",
      ],
      workflow_state_type: ["initial", "intermediate", "final", "rejected"],
    },
  },
} as const
