"""«interface» Repositorio<T> y su implementación RepositorioPostgres<T>.

GRASP Fabricación Pura: no es un concepto de la casa; existe para guardar y leer filas.
GRASP Indirección / Variaciones protegidas: los controladores usan listar/buscar/guardar/eliminar
y no saben que hay PostgreSQL detrás; cambiar de base solo cambia esta clase.
(No hay una clase «interface» aparte: con una sola implementación sería código sin uso.)

Cada fila es un dict; los nombres de tabla/columna vienen del código, nunca del usuario.
"""
from psycopg import sql


class RepositorioPostgres:
    def __init__(self, conn, tabla: str):
        self.conn, self.tabla = conn, sql.Identifier(tabla)

    def listar(self, **filtros) -> list[dict]:
        q = sql.SQL("SELECT * FROM {}").format(self.tabla)
        if filtros:
            q += sql.SQL(" WHERE ") + sql.SQL(" AND ").join(
                sql.SQL("{} = %s").format(sql.Identifier(k)) for k in filtros)
        return self.conn.execute(q + sql.SQL(" ORDER BY id"), list(filtros.values())).fetchall()

    def ultimos(self, n: int) -> list[dict]:
        q = sql.SQL("SELECT * FROM {} ORDER BY id DESC LIMIT %s").format(self.tabla)
        return self.conn.execute(q, [n]).fetchall()

    def buscar(self, id: int) -> dict | None:
        q = sql.SQL("SELECT * FROM {} WHERE id = %s").format(self.tabla)
        return self.conn.execute(q, [id]).fetchone()

    def guardar(self, fila: dict) -> dict:
        """Inserta si no trae id; si trae id, actualiza solo las columnas dadas."""
        datos = {k: v for k, v in fila.items() if k != "id"}
        if "id" in fila:
            q = sql.SQL("UPDATE {} SET {} WHERE id = %s RETURNING *").format(
                self.tabla, sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(k)) for k in datos))
            return self.conn.execute(q, [*datos.values(), fila["id"]]).fetchone()
        q = sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING *").format(
            self.tabla, sql.SQL(", ").join(map(sql.Identifier, datos)),
            sql.SQL(", ").join(sql.Placeholder() * len(datos)))
        return self.conn.execute(q, list(datos.values())).fetchone()

    def eliminar(self, id: int) -> None:
        self.conn.execute(sql.SQL("DELETE FROM {} WHERE id = %s").format(self.tabla), [id])
