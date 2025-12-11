"use client";

import type { AuditLog } from "@/lib/types";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDate } from "@/lib/utils";
import { Timestamp } from "firebase/firestore";
import { Badge } from "../ui/badge";

const actionTextMap: { [key: string]: string } = {
  login: "로그인",
  create_tenant: "임차인 생성",
  update_tenant: "임차인 수정",
  delete_tenant: "임차인 삭제",
  create_building: "건물 생성",
  update_building: "건물 수정",
  delete_building: "건물 삭제",
  create_payment: "납부 생성",
  delete_payment: "납부 삭제",
  update_rent_adjustment: "임대료 조정",
};

const actionVariantMap: { [key: string]: "default" | "secondary" | "destructive" } = {
    login: "secondary",
    create_tenant: "default",
    create_building: "default",
    create_payment: "default",
    update_tenant: "default",
    update_building: "default",
    update_rent_adjustment: "default",
    delete_tenant: "destructive",
    delete_building: "destructive",
    delete_payment: "destructive",
}


export const columns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: "timestamp",
    header: "시간",
    cell: ({ row }) => {
      const date = row.getValue("timestamp") as Timestamp | Date | string;
      return formatDate(date);
    },
  },
  {
    accessorKey: "userEmail",
    header: "사용자",
  },
  {
    accessorKey: "action",
    header: "작업",
    cell: ({ row }) => {
        const action = row.getValue("action") as string;
        return <Badge variant={actionVariantMap[action] || "secondary"}>{actionTextMap[action] || action}</Badge>;
    }
  },
  {
    accessorKey: "details",
    header: "상세 정보",
    cell: ({ row }) => {
      const details = row.getValue("details") as Record<string, any> | undefined;
      if (!details) return "N/A";
      return <pre className="text-xs bg-muted p-2 rounded-md">{JSON.stringify(details, null, 2)}</pre>;
    },
  },
];
