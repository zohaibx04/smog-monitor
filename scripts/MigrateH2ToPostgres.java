import java.sql.*;
import java.time.OffsetDateTime;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Copies a stopped H2 database into an empty, initialized PostgreSQL database. */
public class MigrateH2ToPostgres {
    static final String[] TABLES={"monitored_area","smog_reading","alert_preference","smog_alert"};
    static String digest(Connection c,String table,String selectedColumns) throws Exception {
        var hash=MessageDigest.getInstance("SHA-256");
        try(var s=c.createStatement();var r=s.executeQuery("SELECT "+selectedColumns+" FROM "+table+" ORDER BY id")) {
            var meta=r.getMetaData();
            var columns=new TreeMap<String,Integer>();
            for(int i=1;i<=meta.getColumnCount();i++) columns.put(meta.getColumnName(i).toLowerCase(Locale.ROOT),i);
            while(r.next()) for(int i:columns.values()) {
                Object value=(meta.getColumnType(i)==Types.TIMESTAMP_WITH_TIMEZONE || meta.getColumnType(i)==Types.TIMESTAMP)
                    ? r.getObject(i,OffsetDateTime.class) : r.getObject(i);
                if(value instanceof OffsetDateTime t) value=t.toInstant();
                String text=value==null?"NULL":value.getClass().getSimpleName()+":"+value;
                byte[] bytes=text.getBytes(StandardCharsets.UTF_8);
                hash.update((bytes.length+":").getBytes(StandardCharsets.UTF_8));hash.update(bytes);
            }
        }
        return HexFormat.of().formatHex(hash.digest());
    }
    public static void main(String[] args) throws Exception {
        String url=System.getenv("DB_URL");
        if(url==null||!url.startsWith("jdbc:postgresql:")) throw new IllegalArgumentException("PostgreSQL target required");
        try(var source=DriverManager.getConnection("jdbc:h2:file:"+args[0]+";IFEXISTS=TRUE;ACCESS_MODE_DATA=r","sa","");
            var target=DriverManager.getConnection(url,System.getenv("DB_USER"),System.getenv("DB_PASSWORD"))) {
            target.setAutoCommit(false);
            try {
                try(var s=target.createStatement()) {
                    s.execute("LOCK TABLE monitored_area,smog_reading,alert_preference,smog_alert IN ACCESS EXCLUSIVE MODE");
                    for(String table:TABLES) try(var r=s.executeQuery("SELECT count(*) FROM "+table)) {
                        r.next();if(r.getLong(1)!=0) throw new IllegalStateException("Target must be empty: "+table);
                    }
                }
                for(String table:TABLES) {
                    long count=0;
                    String selectedColumns;
                    try(var s=source.createStatement();var rows=s.executeQuery("SELECT * FROM "+table+" ORDER BY id")) {
                        var meta=rows.getMetaData();int n=meta.getColumnCount();var names=new ArrayList<String>();
                        for(int i=1;i<=n;i++) names.add(meta.getColumnName(i).toLowerCase(Locale.ROOT));
                        selectedColumns=String.join(",",names);
                        String sql="INSERT INTO "+table+" ("+String.join(",",names)+") VALUES ("+String.join(",",Collections.nCopies(n,"?"))+")";
                        try(var insert=target.prepareStatement(sql)) {
                            while(rows.next()) {for(int i=1;i<=n;i++) insert.setObject(i,rows.getObject(i));insert.executeUpdate();count++;}
                        }
                    }
                    String expected=digest(source,table,selectedColumns),actual=digest(target,table,selectedColumns);
                    if(!expected.equals(actual)) throw new IllegalStateException("Content verification failed: "+table);
                    try(var s=target.createStatement()) {
                        s.execute("SELECT setval(pg_get_serial_sequence('"+table+"','id'),COALESCE(MAX(id),1),MAX(id) IS NOT NULL) FROM "+table);
                    }
                    System.out.println(table+": "+count+" rows, SHA-256 "+actual+" verified");
                }
                target.commit();System.out.println("Migration committed. Source database unchanged.");
            } catch(Exception e) {target.rollback();throw e;}
        }
    }
}
