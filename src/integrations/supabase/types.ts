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
  public: {
    Tables: {
      appointments: {
        Row: {
          arrived_at: string | null
          booked_at: string | null
          booked_online: boolean | null
          cancelled_at: string | null
          cancelled_reason: string | null
          chart_status: string | null
          duration_min: number | null
          end_at: string | null
          first_visit: boolean | null
          import_id: string | null
          is_internal: boolean
          jane_id: number
          location: string | null
          patient_guid: string | null
          patient_name: string | null
          patient_number: string | null
          practitioner: string | null
          start_at: string | null
          state: string | null
          treatment_name: string | null
        }
        Insert: {
          arrived_at?: string | null
          booked_at?: string | null
          booked_online?: boolean | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          chart_status?: string | null
          duration_min?: number | null
          end_at?: string | null
          first_visit?: boolean | null
          import_id?: string | null
          is_internal?: boolean
          jane_id: number
          location?: string | null
          patient_guid?: string | null
          patient_name?: string | null
          patient_number?: string | null
          practitioner?: string | null
          start_at?: string | null
          state?: string | null
          treatment_name?: string | null
        }
        Update: {
          arrived_at?: string | null
          booked_at?: string | null
          booked_online?: boolean | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          chart_status?: string | null
          duration_min?: number | null
          end_at?: string | null
          first_visit?: boolean | null
          import_id?: string | null
          is_internal?: boolean
          jane_id?: number
          location?: string | null
          patient_guid?: string | null
          patient_name?: string | null
          patient_number?: string | null
          practitioner?: string | null
          start_at?: string | null
          state?: string | null
          treatment_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "import_log"
            referencedColumns: ["id"]
          },
        ]
      }
      category_map: {
        Row: {
          income_category: string
          reporting_group: string
        }
        Insert: {
          income_category: string
          reporting_group: string
        }
        Update: {
          income_category?: string
          reporting_group?: string
        }
        Relationships: []
      }
      import_log: {
        Row: {
          errors: Json
          file_name: string | null
          id: string
          inserted: number
          period_end: string | null
          period_start: string | null
          report_type: string
          rows_read: number
          skipped: number
          updated: number
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          errors?: Json
          file_name?: string | null
          id?: string
          inserted?: number
          period_end?: string | null
          period_start?: string | null
          report_type: string
          rows_read?: number
          skipped?: number
          updated?: number
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          errors?: Json
          file_name?: string | null
          id?: string
          inserted?: number
          period_end?: string | null
          period_start?: string | null
          report_type?: string
          rows_read?: number
          skipped?: number
          updated?: number
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      internal_treatments: {
        Row: {
          treatment_name: string
        }
        Insert: {
          treatment_name: string
        }
        Update: {
          treatment_name?: string
        }
        Relationships: []
      }
      kpi_targets: {
        Row: {
          direction: string
          kpi_code: string
          target: number | null
        }
        Insert: {
          direction?: string
          kpi_code: string
          target?: number | null
        }
        Update: {
          direction?: string
          kpi_code?: string
          target?: number | null
        }
        Relationships: []
      }
      monthly_finance: {
        Row: {
          addbacks: number
          marketing_spend: number
          month: string
          notes: string | null
          operating_expenses: number
        }
        Insert: {
          addbacks?: number
          marketing_spend?: number
          month: string
          notes?: string | null
          operating_expenses?: number
        }
        Update: {
          addbacks?: number
          marketing_spend?: number
          month?: string
          notes?: string | null
          operating_expenses?: number
        }
        Relationships: []
      }
      patients: {
        Row: {
          first_location: string | null
          first_practitioner: string | null
          first_treatment: string | null
          first_visit_at: string | null
          last_visit_at: string | null
          lifetime_revenue: number
          next_booked_at: string | null
          patient_guid: string
          patient_name: string | null
          patient_number: string | null
          visit_count: number
        }
        Insert: {
          first_location?: string | null
          first_practitioner?: string | null
          first_treatment?: string | null
          first_visit_at?: string | null
          last_visit_at?: string | null
          lifetime_revenue?: number
          next_booked_at?: string | null
          patient_guid: string
          patient_name?: string | null
          patient_number?: string | null
          visit_count?: number
        }
        Update: {
          first_location?: string | null
          first_practitioner?: string | null
          first_treatment?: string | null
          first_visit_at?: string | null
          last_visit_at?: string | null
          lifetime_revenue?: number
          next_booked_at?: string | null
          patient_guid?: string
          patient_name?: string | null
          patient_number?: string | null
          visit_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      provider_shifts: {
        Row: {
          available_hours: number
          id: string
          import_id: string | null
          location: string | null
          practitioner: string
          shift_date: string
          source: string
        }
        Insert: {
          available_hours?: number
          id?: string
          import_id?: string | null
          location?: string | null
          practitioner: string
          shift_date: string
          source?: string
        }
        Update: {
          available_hours?: number
          id?: string
          import_id?: string | null
          location?: string | null
          practitioner?: string
          shift_date?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_shifts_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "import_log"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          active: boolean
          display_name: string | null
          include_in_kpis: boolean
          name: string
          role: string | null
        }
        Insert: {
          active?: boolean
          display_name?: string | null
          include_in_kpis?: boolean
          name: string
          role?: string | null
        }
        Update: {
          active?: boolean
          display_name?: string | null
          include_in_kpis?: boolean
          name?: string
          role?: string | null
        }
        Relationships: []
      }
      sales_lines: {
        Row: {
          balance: number
          collected: number
          gst: number
          import_id: string | null
          income_category: string | null
          invoice_date: string | null
          invoice_line_no: string
          is_refund: boolean
          item: string | null
          location: string | null
          patient_guid: string | null
          patient_name: string | null
          payer: string | null
          pst: number
          purchase_date: string | null
          quantity: number | null
          staff_member: string | null
          status: string | null
          subtotal: number
          total: number
        }
        Insert: {
          balance?: number
          collected?: number
          gst?: number
          import_id?: string | null
          income_category?: string | null
          invoice_date?: string | null
          invoice_line_no: string
          is_refund?: boolean
          item?: string | null
          location?: string | null
          patient_guid?: string | null
          patient_name?: string | null
          payer?: string | null
          pst?: number
          purchase_date?: string | null
          quantity?: number | null
          staff_member?: string | null
          status?: string | null
          subtotal?: number
          total?: number
        }
        Update: {
          balance?: number
          collected?: number
          gst?: number
          import_id?: string | null
          income_category?: string | null
          invoice_date?: string | null
          invoice_line_no?: string
          is_refund?: boolean
          item?: string | null
          location?: string | null
          patient_guid?: string | null
          patient_name?: string | null
          payer?: string | null
          pst?: number
          purchase_date?: string | null
          quantity?: number | null
          staff_member?: string | null
          status?: string | null
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_lines_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "import_log"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_profile: {
        Args: never
        Returns: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_profile: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_internal: { Args: never; Returns: number }
      refresh_patients: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "viewer"
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
      app_role: ["admin", "viewer"],
    },
  },
} as const
