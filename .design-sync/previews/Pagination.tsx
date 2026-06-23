import { Pagination } from "mehamakor-frontend";

export function MiddlePage() {
  return (
    <div style={{ width: "100%", maxWidth: 560 }}>
      <Pagination page={4} totalPages={12} onChange={() => {}} />
    </div>
  );
}

export function FirstPage() {
  return (
    <div style={{ width: "100%", maxWidth: 560 }}>
      <Pagination page={1} totalPages={6} onChange={() => {}} />
    </div>
  );
}

export function WithPerPage() {
  return (
    <div style={{ width: "100%", maxWidth: 560 }}>
      <Pagination
        page={2}
        totalPages={8}
        onChange={() => {}}
        perPage={25}
        onPerPageChange={() => {}}
      />
    </div>
  );
}
